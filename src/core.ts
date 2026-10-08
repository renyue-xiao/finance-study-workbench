import { randomUUID } from 'node:crypto';
import { createEmptyCard, fsrs, type Card } from '../vendor/fsrs.mjs';
import type { Command, Deck, MemoryCard, StudyState, PlanSummary } from './model.ts';
export const DAY = 86400000;
export const WRONG_DELAY = 10 * 60 * 1000;
const SUCCESS_DELAYS = [1, 3, 7, 14].map((d) => d * DAY);
const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: false,
});
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export const studyDay = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
export function initialState(now = new Date()): StudyState {
  const today = studyDay(now);
  return {
    schemaVersion: 1,
    revision: 0,
    settings: { startDate: today, examDate: shiftDay(today, 60), newStopDays: 7, groupSize: 5 },
    cards: {},
    reinforcement: {},
    logs: [],
    session: null,
  };
}
export function dueAt(state: StudyState, id: string): string | undefined {
  const r = state.reinforcement[id];
  return r && r.successes < 5 ? r.due : state.cards[id]?.due;
}
export function dailyPlan(state: StudyState, deck: Deck, now = new Date()): PlanSummary {
  const today = studyDay(now),
    newStopDate = shiftDay(state.settings.examDate, -state.settings.newStopDays);
  const newDaysRemaining = Math.max(
    0,
    Math.round((Date.parse(newStopDate) - Date.parse(today)) / DAY),
  );
  const todayLogs = state.logs.filter((l) => studyDay(new Date(l.at)) === today),
    newDone = new Set(todayLogs.filter((l) => l.isNew).map((l) => l.cardId)).size,
    reviewDone = todayLogs.filter((l) => !l.isNew).length;
  const remaining = deck.cards.filter((c) => !state.cards[c.id]).length;
  const newAllowed = today >= state.settings.startDate && newDaysRemaining > 0;
  const newTarget = newAllowed
    ? Math.max(newDone, Math.ceil((remaining + newDone) / newDaysRemaining))
    : newDone;
  const newRemaining = newAllowed ? Math.max(0, Math.min(remaining, newTarget - newDone)) : 0;
  const deadlines = deck.cards.map((c) => dueAt(state, c.id)).filter((v): v is string => !!v);
  const reviewDue = deadlines.filter((d) => Date.parse(d) <= now.getTime()).length;
  const reviewLaterToday = deadlines.filter(
    (d) => Date.parse(d) > now.getTime() && studyDay(new Date(d)) === today,
  ).length;
  const active = !!state.session && state.session.phase !== 'complete';
  const pending = active ? state.session!.queue.length : 0;
  const tasksRemaining = Math.max(pending, newRemaining + reviewDue + reviewLaterToday);
  return {
    today,
    newStopDate,
    newDaysRemaining,
    newTarget,
    newDone,
    newRemaining,
    reviewDue,
    reviewLaterToday,
    reviewDone,
    remainingFirstPass: remaining,
    firstPassDone: deck.cards.length - remaining,
    totalWords: deck.cards.length,
    groupsRemaining: active
      ? 1 + Math.ceil(Math.max(0, tasksRemaining - pending) / state.settings.groupSize)
      : Math.ceil(tasksRemaining / state.settings.groupSize),
    nextReviewAt: deadlines.filter((d) => Date.parse(d) > now.getTime()).sort()[0] ?? null,
  };
}
function revive(card: MemoryCard): Card {
  return {
    ...card,
    due: new Date(card.due),
    ...(card.last_review
      ? { last_review: new Date(card.last_review) }
      : { last_review: undefined }),
  };
}
function next(state: StudyState, now: Date) {
  const s = state.session!;
  s.turn++;
  s.draft = '';
  if (!s.queue.length) {
    s.phase = 'complete';
    s.currentId = null;
    s.paused = false;
    return;
  }
  const opening = s.queue.filter((id) => s.opening.includes(id));
  const candidates = opening.length ? opening : s.queue;
  const id = candidates.find(
    (id) => !dueAt(state, id) || Date.parse(dueAt(state, id)!) <= now.getTime(),
  );
  if (!id) {
    s.phase = 'waiting';
    s.currentId = null;
    return;
  }
  s.queue = [id, ...s.queue.filter((x) => x !== id)];
  s.currentId = id;
  s.phase = 'prompt';
}
export function applyCommand(
  state: StudyState,
  deck: Deck,
  command: Command,
  now = new Date(),
): StudyState {
  const s = structuredClone(state);
  if (command.action === 'settings') {
    if (!command.settings) fail('缺少计划设置');
    if (s.session && s.session.phase !== 'complete') fail('完成当前组后再修改计划');
    s.settings = command.settings;
    return s;
  }
  if (command.action === 'start') {
    if (s.session && s.session.phase !== 'complete') fail('请先完成或继续当前组');
    if (!['new', 'review'].includes(command.mode ?? '')) fail('请选择新词或复习');
    const previous = s.session;
    const opening = (previous?.wrong ?? []).filter(
      (id) => (s.reinforcement[id]?.successes ?? 5) < 5,
    );
    const due = deck.cards
      .filter((c) => dueAt(s, c.id) && Date.parse(dueAt(s, c.id)!) <= now.getTime())
      .sort((a, b) => dueAt(s, a.id)!.localeCompare(dueAt(s, b.id)!))
      .map((c) => c.id);
    const fresh =
      command.mode === 'new'
        ? deck.cards
            .filter((c) => !s.cards[c.id])
            .slice(0, dailyPlan(s, deck, now).newRemaining)
            .map((c) => c.id)
        : [];
    const queue = [...new Set([...opening, ...due, ...fresh])].slice(0, s.settings.groupSize);
    if (!queue.length) fail('当前没有可开始的词；请查看今日计划和下次复习时间');
    s.session = {
      id: randomUUID(),
      queue,
      currentId: null,
      phase: 'prompt',
      paused: false,
      turn: 0,
      draft: '',
      judged: [],
      wrong: [],
      opening,
    };
    next(s, now);
    return s;
  }
  const session = s.session;
  if (!session || session.id !== command.sessionId || session.turn !== command.turn)
    fail('学习组或当前词已变化，请刷新后重试', 409);
  if (session.phase === 'complete') fail('本组已完成');
  if (command.action === 'resume') {
    session.paused = false;
    return s;
  }
  if (session.paused) fail('请先继续学习组');
  if (command.action === 'pause') {
    session.paused = true;
    return s;
  }
  if (command.action === 'reveal') {
    if (session.phase !== 'prompt') fail('当前不能揭示答案');
    const card = deck.cards.find((c) => c.id === session.currentId)!;
    if (card.kind === 'question' && !card.options?.some((o) => o.id === command.draft))
      fail('先选择一个选项，再查看答案');
    session.draft = command.draft ?? '';
    session.phase = 'answer';
    session.turn++;
    return s;
  }
  if (command.action === 'answer') {
    if (session.phase !== 'answer' || !session.currentId) fail('先显示答案，再判断记对或记错');
    if (typeof command.correct !== 'boolean') fail('请选择记对或记错');
    const id = session.currentId,
      card = deck.cards.find((c) => c.id === id)!;
    if (session.judged.includes(id)) fail('本组已经判断过此词', 409);
    const forcedWrong = card.kind === 'question' && session.draft !== card.answerOption,
      correct = command.correct && !forcedWrong;
    const isNew = !s.cards[id];
    const result = scheduler.next(
      s.cards[id] ? revive(s.cards[id]) : createEmptyCard(now),
      now,
      correct ? 3 : 1,
    );
    s.cards[id] = {
      ...result.card,
      due: result.card.due.toISOString(),
      ...(result.card.last_review
        ? { last_review: result.card.last_review.toISOString() }
        : { last_review: undefined }),
    };
    const r = s.reinforcement[id];
    if (!correct) {
      s.reinforcement[id] = {
        successes: r && r.successes < 5 ? r.successes : 0,
        due: new Date(now.getTime() + WRONG_DELAY).toISOString(),
        lastWrongGroup: session.id,
        lastSuccessGroup: r && r.successes < 5 ? r.lastSuccessGroup : null,
      };
      session.wrong.push(id);
    } else if (r && r.successes < 5 && r.lastSuccessGroup !== session.id) {
      r.successes++;
      r.lastSuccessGroup = session.id;
      r.due =
        r.successes === 5
          ? s.cards[id].due
          : new Date(now.getTime() + SUCCESS_DELAYS[r.successes - 1]).toISOString();
    }
    s.logs.push({
      id: randomUUID(),
      cardId: id,
      at: now.toISOString(),
      correct,
      isNew,
      groupId: session.id,
      requestedCorrect: command.correct,
      forcedWrong,
    });
    session.judged.push(id);
    session.queue = session.queue.filter((x) => x !== id);
    if (correct) next(s, now);
    else {
      session.phase = 'feedback';
      session.turn++;
    }
    return s;
  }
  if (command.action === 'advance') {
    if (!['feedback', 'waiting'].includes(session.phase)) fail('当前不需要继续');
    if (session.phase === 'feedback' && session.currentId) {
      const r = s.reinforcement[session.currentId];
      r.due = new Date(now.getTime() + WRONG_DELAY).toISOString();
    }
    next(s, now);
    return s;
  }
  if (command.action === 'skip') {
    if (!['prompt', 'answer'].includes(session.phase) || !session.currentId) fail('当前不能跳过');
    session.queue.push(session.queue.shift()!);
    next(s, now);
    return s;
  }
  fail('未知学习操作');
}
