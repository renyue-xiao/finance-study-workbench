import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { StudyStore } from '../src/store.ts';
import { createApp } from '../src/http.ts';
import { validateDeck } from '../src/validation.ts';
const deck = validateDeck(
  JSON.parse(readFileSync(new URL('../content/deck.json', import.meta.url), 'utf8')),
);
const now = new Date('2030-01-01T01:00:00.000Z');
test('真实SQLite：请求重放幂等、CAS拒绝、关闭重开可续、恢复事件合并且原判断保留', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'finance-study-test-')),
    file = path.join(dir, 'test.sqlite');
  let store = new StudyStore(file, deck, now);
  try {
    const start = { action: 'start', mode: 'new', revision: 0, requestId: 'start-unique' };
    let s = store.command(start, now);
    assert.equal(store.command(start, now).revision, 1);
    assert.throws(() => store.command({ ...start, mode: 'review' }, now), /同一操作/);
    assert.throws(() => store.command({ ...start, requestId: 'stale-one' }, now), /另一标签/);
    s = store.command(
      {
        action: 'reveal',
        revision: s.revision,
        sessionId: s.session!.id,
        turn: s.session!.turn,
        requestId: 'reveal-one',
      },
      now,
    );
    const before = store.backup(now);
    const answer = {
      action: 'answer',
      correct: true,
      revision: s.revision,
      sessionId: s.session!.id,
      turn: s.session!.turn,
      requestId: 'answer-one',
    };
    s = store.command(answer, now);
    store.command(answer, now);
    assert.equal(store.events().length, 1);
    assert.equal(s.logs.length, 1);
    store.close();
    store = new StudyStore(file, deck, now);
    assert.equal(store.state().logs.length, 1);
    const restored = store.restore(before, store.state().revision, 'restore-one', now);
    assert.equal(restored.logs.length, 0);
    assert.equal(restored.session!.phase, 'answer');
    assert.equal(store.events().filter((e) => e.kind === 'answer').length, 1);
    assert.equal(store.events().filter((e) => e.kind === 'restore').length, 1);
    const bad = store.backup(now);
    bad.state.cards['cash-flow'] = { ...s.cards['cash-flow'], difficulty: NaN };
    const revision = store.state().revision;
    assert.throws(() => store.restore(bad, revision, 'bad-restore', now));
    assert.equal(store.state().revision, revision);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('真实HTTP：提示无答案、错误阶段不评分、来源检查、静态路径白名单与非法JSON', async () => {
  const store = new StudyStore(':memory:', deck, now),
    server = createApp(store);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (url: string, body: unknown, extra: Record<string, string> = {}) =>
    fetch(base + url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-study-client': '1', ...extra },
      body: JSON.stringify(body),
    });
  try {
    const s = store.command(
      { action: 'start', mode: 'new', revision: 0, requestId: 'test-start' },
      now,
    );
    const state = await (await fetch(base + '/api/state')).json();
    assert.equal(state.current.back, undefined);
    assert.equal(state.current.explanation, undefined);
    const bad = await post('/api/command', {
      action: 'answer',
      correct: true,
      revision: s.revision,
      requestId: 'bad-answer',
      sessionId: s.session!.id,
      turn: s.session!.turn,
    });
    assert.equal(bad.status, 400);
    assert.equal(store.events().length, 0);
    assert.equal((await post('/api/command', {}, { origin: 'https://example.com' })).status, 403);
    assert.equal((await fetch(base + '/content/deck.json')).status, 404);
    assert.equal((await fetch(base + '/data/learning.sqlite')).status, 404);
    assert.equal((await fetch(base + '/vendor/fsrs.mjs')).status, 404);
    const syntax = await fetch(base + '/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-study-client': '1' },
      body: '{broken',
    });
    assert.equal(syntax.status, 400);
    assert.equal(store.state().revision, s.revision);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
