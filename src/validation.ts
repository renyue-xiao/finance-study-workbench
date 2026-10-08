import { fail, DAY } from './core.ts';
import type { Command, Deck, Judgment, Settings, StudyState } from './model.ts';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (!object(value)) fail(name + '必须是对象');
  return value;
}
function text(value: unknown, max = 2000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
export function validDay(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
const instant = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
export function validateSettings(raw: unknown): Settings {
  const s = requireObject(raw, '设置');
  if (
    !validDay(s.startDate) ||
    !validDay(s.examDate) ||
    s.startDate >= s.examDate ||
    !integer(s.newStopDays, 0, 30) ||
    !integer(s.groupSize, 1, 80)
  )
    fail('设置需有有效起止日期、0至30天冲刺期和1至80项组量');
  const span = (Date.parse(s.examDate) - Date.parse(s.startDate)) / DAY;
  if (span > 5 * 366 || s.newStopDays >= span) fail('计划最长五年，冲刺期需短于整个计划');
  return {
    startDate: s.startDate,
    examDate: s.examDate,
    newStopDays: s.newStopDays,
    groupSize: s.groupSize,
  };
}
export function validateDeck(raw: unknown): Deck {
  const d = requireObject(raw, '词库');
  if (
    !text(d.id, 100) ||
    !text(d.title, 200) ||
    !text(d.license, 100) ||
    !Array.isArray(d.cards) ||
    !d.cards.length ||
    d.cards.length > 5000
  )
    fail('词库结构不正确');
  const ids = new Set<string>();
  for (const value of d.cards) {
    const c = requireObject(value, '词卡');
    if (
      !text(c.id, 100) ||
      !/^[a-z0-9][a-z0-9-]*$/.test(c.id) ||
      ids.has(c.id) ||
      !['term', 'question'].includes(String(c.kind)) ||
      !text(c.front) ||
      !text(c.back) ||
      !text(c.explanation, 6000)
    )
      fail('词卡ID、题面或解释不正确');
    ids.add(c.id);
    if (c.kind === 'question') {
      if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 6)
        fail('题目需2至6个选项');
      const optionIds = new Set<string>();
      for (const value of c.options) {
        const o = requireObject(value, '选项');
        if (!text(o.id, 20) || optionIds.has(o.id) || !text(o.label, 500)) fail('选项不正确');
        optionIds.add(o.id);
      }
      if (typeof c.answerOption !== 'string' || !optionIds.has(c.answerOption))
        fail('正确选项不在选项列表中');
    }
  }
  return structuredClone(d) as unknown as Deck;
}
export function validateJudgment(raw: unknown, ids: Set<string>): Judgment {
  const l = requireObject(raw, '判断记录');
  if (
    !text(l.id, 100) ||
    !text(l.cardId, 100) ||
    !ids.has(l.cardId) ||
    !instant(l.at) ||
    typeof l.correct !== 'boolean' ||
    typeof l.isNew !== 'boolean' ||
    !text(l.groupId, 100) ||
    typeof l.requestedCorrect !== 'boolean' ||
    typeof l.forcedWrong !== 'boolean' ||
    (l.forcedWrong && l.correct) ||
    l.correct !== (l.requestedCorrect && !l.forcedWrong)
  )
    fail('判断记录字段不一致');
  return structuredClone(l) as unknown as Judgment;
}
export function validateState(raw: unknown, deck: Deck): StudyState {
  const s = requireObject(raw, '进度');
  if (s.schemaVersion !== 1 || !integer(s.revision)) fail('不支持的进度版本');
  const settings = validateSettings(s.settings),
    cards = requireObject(s.cards, '记忆卡'),
    reinforcement = requireObject(s.reinforcement, '巩固状态'),
    ids = new Set(deck.cards.map((c) => c.id));
  for (const [id, value] of Object.entries(cards)) {
    const c = requireObject(value, '记忆卡 ' + id);
    if (
      !ids.has(id) ||
      !instant(c.due) ||
      !integer(c.state, 0, 3) ||
      (c.last_review !== undefined && !instant(c.last_review))
    )
      fail('记忆卡ID或日期不正确');
    for (const key of [
      'stability',
      'difficulty',
      'elapsed_days',
      'scheduled_days',
      'reps',
      'lapses',
      'learning_steps',
    ])
      if (typeof c[key] !== 'number' || !Number.isFinite(c[key]) || c[key] < 0)
        fail('记忆卡数值不正确');
    if (
      (c.difficulty as number) > 10 ||
      (c.stability as number) > 36500 ||
      !['reps', 'lapses', 'learning_steps'].every((k) => integer(c[k]))
    )
      fail('记忆卡范围不正确');
  }
  for (const [id, value] of Object.entries(reinforcement)) {
    const r = requireObject(value, '巩固记录');
    if (
      !ids.has(id) ||
      !cards[id] ||
      !integer(r.successes, 0, 5) ||
      !instant(r.due) ||
      !text(r.lastWrongGroup, 100) ||
      !(r.lastSuccessGroup === null || text(r.lastSuccessGroup, 100)) ||
      (r.successes > 0 && r.lastSuccessGroup === null)
    )
      fail('跨组巩固记录不正确');
  }
  if (!Array.isArray(s.logs) || s.logs.length > 50000) fail('判断记录最多50000条');
  const logs = s.logs.map((l) => validateJudgment(l, ids));
  if (new Set(logs.map((l) => l.id)).size !== logs.length) fail('判断ID重复');
  if (Object.keys(cards).some((id) => !logs.some((l) => l.cardId === id)))
    fail('记忆状态缺少真实判断记录');
  if (s.session !== null) {
    const x = requireObject(s.session, '学习组');
    if (
      !text(x.id, 100) ||
      !integer(x.turn, 1) ||
      !['prompt', 'answer', 'feedback', 'waiting', 'complete'].includes(String(x.phase)) ||
      typeof x.paused !== 'boolean' ||
      typeof x.draft !== 'string' ||
      x.draft.length > 500
    )
      fail('学习组结构不正确');
    for (const key of ['queue', 'judged', 'wrong', 'opening']) {
      const a = x[key];
      if (
        !Array.isArray(a) ||
        a.length > 80 ||
        new Set(a).size !== a.length ||
        a.some((id) => typeof id !== 'string' || !ids.has(id))
      )
        fail('学习组队列不正确');
    }
    const queue = x.queue as string[],
      judged = x.judged as string[],
      wrong = x.wrong as string[],
      opening = x.opening as string[];
    if (
      queue.some((id) => judged.includes(id)) ||
      wrong.some((id) => !judged.includes(id)) ||
      opening.some((id) => !reinforcement[id]) ||
      wrong.some(
        (id) =>
          !reinforcement[id] ||
          (reinforcement[id] as Record<string, unknown>).lastWrongGroup !== x.id,
      )
    )
      fail('学习组队列与判断不一致');
    if (x.phase === 'complete') {
      if (queue.length || x.currentId !== null || x.paused) fail('已完成学习组仍有待处理词');
    } else if (x.phase === 'waiting') {
      if (!queue.length || x.currentId !== null) fail('等待组结构不正确');
    } else if (x.phase === 'feedback') {
      if (
        typeof x.currentId !== 'string' ||
        !wrong.includes(x.currentId) ||
        queue.includes(x.currentId)
      )
        fail('记错反馈缺少记录');
    } else if (!queue.length || x.currentId !== queue[0]) fail('当前词与队列不一致');
    const groupLogs = logs.filter((l) => l.groupId === x.id);
    if (
      judged.some((id) => groupLogs.filter((l) => l.cardId === id).length !== 1) ||
      groupLogs.some((l) => !judged.includes(l.cardId)) ||
      wrong.some((id) => !groupLogs.some((l) => l.cardId === id && !l.correct)) ||
      groupLogs.some((l) => !l.correct && !wrong.includes(l.cardId))
    )
      fail('同组判断记录不一致');
  }
  return { ...structuredClone(s), settings, logs } as unknown as StudyState;
}
export function validateCommand(raw: unknown): Command {
  const c = requireObject(raw, '操作');
  if (
    !text(c.requestId, 100) ||
    c.requestId.length < 8 ||
    !integer(c.revision) ||
    !['settings', 'start', 'reveal', 'answer', 'advance', 'skip', 'pause', 'resume'].includes(
      String(c.action),
    )
  )
    fail('操作ID、版本或动作不正确');
  if (c.action === 'settings') c.settings = validateSettings(c.settings);
  if (c.draft !== undefined && (typeof c.draft !== 'string' || c.draft.length > 500))
    fail('答案输入过长');
  return structuredClone(c) as unknown as Command;
}
