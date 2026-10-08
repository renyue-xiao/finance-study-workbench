import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCommand, initialState, dailyPlan, WRONG_DELAY, DAY, dueAt } from '../src/core.ts';
import { validateDeck, validateState, validateSettings } from '../src/validation.ts';
import { studyView } from '../src/view.ts';
import type { Command, StudyState } from '../src/model.ts';
const deck = validateDeck(
  JSON.parse(readFileSync(new URL('../content/deck.json', import.meta.url), 'utf8')),
);
const now = new Date('2030-01-01T01:00:00.000Z');
const setup = () => {
  const s = initialState(now);
  s.settings = { startDate: '2030-01-01', examDate: '2030-01-03', newStopDays: 0, groupSize: 5 };
  return s;
};
function act(state: StudyState, action: Command['action'], extra: Partial<Command> = {}, at = now) {
  return applyCommand(
    state,
    deck,
    {
      revision: state.revision,
      requestId: 'request-test',
      sessionId: state.session?.id,
      turn: state.session?.turn,
      action,
      ...extra,
    },
    at,
  );
}
test('提示页不返回答案；揭示不写判断；未揭示不能评分', () => {
  let s = act(setup(), 'start', { mode: 'new' });
  assert.equal(studyView(s, deck, now).current?.back, undefined);
  assert.equal(studyView(s, deck, now).current?.explanation, undefined);
  assert.throws(() => act(s, 'answer', { correct: true }), /显示答案/);
  s = act(s, 'reveal');
  assert.equal(s.logs.length, 0);
  assert.ok(studyView(s, deck, now).current?.back);
  s = act(s, 'answer', { correct: true });
  assert.equal(s.logs.length, 1);
  assert.equal(studyView(s, deck, now).current?.back, undefined);
  assert.equal(s.logs[0].isNew, true);
  validateState(s, deck);
});
test('按剩余词量倒排，今日已完成数维持目标，跨北京时间日界与冲刺期', () => {
  let s = setup();
  assert.equal(dailyPlan(s, deck, now).newTarget, 5);
  s = act(act(act(s, 'start', { mode: 'new' }), 'reveal'), 'answer', { correct: true });
  assert.equal(dailyPlan(s, deck, now).newTarget, 5);
  assert.equal(dailyPlan(s, deck, now).newRemaining, 4);
  assert.equal(dailyPlan(s, deck, new Date('2030-01-01T16:00:00Z')).today, '2030-01-02');
  assert.equal(dailyPlan(s, deck, new Date('2030-01-03T01:00:00Z')).newRemaining, 0);
  assert.throws(() => validateSettings({ ...s.settings, examDate: '2030-02-30' }));
});
test('错词停留，前进不评分；10分钟后跨组复问，五次后接FSRS', () => {
  let s = setup();
  s.settings.groupSize = 1;
  let at = now;
  s = act(
    act(act(s, 'start', { mode: 'new' }, at), 'reveal', {}, at),
    'answer',
    { correct: false },
    at,
  );
  const id = s.session!.currentId!;
  assert.equal(s.session!.phase, 'feedback');
  assert.equal(s.reinforcement[id].successes, 0);
  s = act(s, 'advance', {}, at);
  assert.equal(s.logs.length, 1);
  s = act(s, 'start', { mode: 'review' }, at);
  assert.equal(s.session!.phase, 'waiting');
  s = act(s, 'advance', {}, new Date(at.getTime() + WRONG_DELAY - 1));
  assert.equal(s.session!.phase, 'waiting');
  at = new Date(at.getTime() + WRONG_DELAY);
  s = act(s, 'advance', {}, at);
  for (let i = 1; i <= 5; i++) {
    s = act(act(s, 'reveal', {}, at), 'answer', { correct: true }, at);
    assert.equal(s.reinforcement[id].successes, i);
    if (i < 5) {
      assert.equal(Date.parse(dueAt(s, id)!) - at.getTime(), [1, 3, 7, 14][i - 1] * DAY);
      at = new Date(dueAt(s, id)!);
      s = act(s, 'start', { mode: 'review' }, at);
    }
  }
  assert.equal(dueAt(s, id), s.cards[id].due);
  assert.equal(s.logs.length, 6);
  assert.equal(new Set(s.logs.map((l) => l.groupId)).size, 6);
  validateState(s, deck);
});
test('题目选错不能自判记对；旧turn被拒绝，暂停后不泄露答案', () => {
  const qdeck = { ...deck, cards: deck.cards.filter((c) => c.kind === 'question') };
  let s = setup();
  const command = (action: Command['action'], extra: Partial<Command> = {}) => {
    s = applyCommand(
      s,
      qdeck,
      {
        revision: 0,
        requestId: 'request-test',
        sessionId: s.session?.id,
        turn: s.session?.turn,
        action,
        ...extra,
      },
      now,
    );
  };
  command('start', { mode: 'new' });
  assert.throws(() => command('reveal'), /选择/);
  command('reveal', { draft: 'A' });
  const old = s.session!.turn;
  command('pause');
  assert.equal(studyView(s, qdeck, now).current?.back, undefined);
  command('resume');
  command('answer', { correct: true });
  assert.equal(s.logs[0].correct, false);
  assert.equal(s.logs[0].requestedCorrect, true);
  assert.equal(s.logs[0].forcedWrong, true);
  assert.throws(() => command('advance', { turn: old }), /已变化/);
});
test('跳过不评分，非法恢复状态无法冒充有效进度', () => {
  let s = act(setup(), 'start', { mode: 'new' });
  s = act(s, 'skip');
  assert.equal(s.logs.length, 0);
  const corrupt = structuredClone(s);
  corrupt.session!.currentId = 'does-not-exist';
  assert.throws(() => validateState(corrupt, deck));
  const invalid = structuredClone(s);
  Reflect.set(invalid, 'schemaVersion', 99);
  assert.throws(() => validateState(invalid, deck));
});

test('缺少错词巩固记录的反馈备份被拒绝', () => {
  const s = act(act(act(setup(), 'start', { mode: 'new' }), 'reveal'), 'answer', {
    correct: false,
  });
  delete s.reinforcement[s.session!.currentId!];
  assert.throws(() => validateState(s, deck), /不一致/);
});

test('半完成学习组按剩余容量计入组数，不把新词塞回已固定组', () => {
  let s = setup();
  s.settings.groupSize = 3;
  s = act(s, 'start', { mode: 'new' });
  for (let i = 0; i < 2; i++) s = act(act(s, 'reveal'), 'answer', { correct: true });
  assert.equal(s.session!.queue.length, 1);
  assert.equal(dailyPlan(s, deck, now).newRemaining, 3);
  assert.equal(dailyPlan(s, deck, now).groupsRemaining, 2);
});
