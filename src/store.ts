import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { initialState, applyCommand, fail } from './core.ts';
import { validateCommand, validateJudgment, validateState } from './validation.ts';
import type { Deck, StudyState, Judgment } from './model.ts';
export interface AuditEvent {
  id: string;
  at: string;
  kind: string;
  revision: number;
  judgment?: Judgment;
}
export interface Backup {
  format: 'finance-study-backup';
  version: 1;
  deckId: string;
  exportedAt: string;
  state: StudyState;
  events: AuditEvent[];
}
export class StudyStore {
  readonly db: DatabaseSync;
  readonly deck: Deck;
  constructor(filename: string, deck: Deck, now = new Date()) {
    this.deck = deck;
    this.db = new DatabaseSync(filename);
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS progress(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,value TEXT NOT NULL);',
    );
    this.db
      .prepare('INSERT OR IGNORE INTO progress VALUES(1,?)')
      .run(JSON.stringify(initialState(now)));
    this.state();
  }
  state(): StudyState {
    const row = this.db.prepare('SELECT value FROM progress WHERE id=1').get()!;
    return validateState(JSON.parse(String(row.value)), this.deck);
  }
  events(): AuditEvent[] {
    return this.db
      .prepare('SELECT value FROM audit ORDER BY rowid')
      .all()
      .map((r) => JSON.parse(String(r.value)) as AuditEvent);
  }
  backup(now = new Date()): Backup {
    return {
      format: 'finance-study-backup',
      version: 1,
      deckId: this.deck.id,
      exportedAt: now.toISOString(),
      state: this.state(),
      events: this.events(),
    };
  }
  private transaction(
    requestId: string,
    revision: number,
    payload: unknown,
    operation: (state: StudyState) => StudyState,
  ): StudyState {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.db.prepare('SELECT hash FROM requests WHERE id=?').get(requestId);
      if (old) {
        if (old.hash !== hash) fail('同一操作ID不能对应不同内容', 409);
        const current = this.state();
        this.db.exec('COMMIT');
        return current;
      }
      const current = this.state();
      if (revision !== current.revision) fail('进度已在另一标签页变化，请刷新后重试', 409);
      const next = operation(current);
      next.revision = current.revision + 1;
      validateState(next, this.deck);
      this.db.prepare('UPDATE progress SET value=? WHERE id=1').run(JSON.stringify(next));
      this.db.prepare('INSERT INTO requests VALUES(?,?)').run(requestId, hash);
      this.db.exec('COMMIT');
      return next;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  private addEvent(event: AuditEvent) {
    const value = JSON.stringify(event);
    const old = this.db.prepare('SELECT value FROM audit WHERE id=?').get(event.id);
    if (old) {
      if (old.value !== value) fail('备份事件ID与已有记录冲突');
      return;
    }
    this.db.prepare('INSERT INTO audit VALUES(?,?)').run(event.id, value);
  }
  command(raw: unknown, now = new Date()): StudyState {
    const c = validateCommand(raw);
    return this.transaction(c.requestId, c.revision, c, (state) => {
      const next = applyCommand(state, this.deck, c, now);
      if (c.action === 'answer') {
        const judgment = next.logs.at(-1)!;
        this.addEvent({
          id: judgment.id,
          at: now.toISOString(),
          kind: 'answer',
          revision: state.revision + 1,
          judgment,
        });
      } else if (['skip', 'settings'].includes(c.action))
        this.addEvent({
          id: randomUUID(),
          at: now.toISOString(),
          kind: c.action,
          revision: state.revision + 1,
        });
      return next;
    });
  }
  restore(raw: unknown, revision: number, requestId: string, now = new Date()): StudyState {
    if (
      typeof requestId !== 'string' ||
      requestId.length < 8 ||
      requestId.length > 100 ||
      !Number.isSafeInteger(revision)
    )
      fail('恢复操作ID或版本不正确');
    if (!raw || typeof raw !== 'object') fail('备份格式不正确');
    const b = raw as Partial<Backup>;
    if (
      b.format !== 'finance-study-backup' ||
      b.version !== 1 ||
      b.deckId !== this.deck.id ||
      !Array.isArray(b.events) ||
      b.events.length > 100000
    )
      fail('备份版本或词库不匹配；仅支持本项目备份');
    const restored = validateState(b.state, this.deck),
      ids = new Set(this.deck.cards.map((c) => c.id));
    const eventIds = new Set<string>();
    for (const e of b.events) {
      if (
        !e ||
        typeof e.id !== 'string' ||
        !e.id.length ||
        e.id.length > 100 ||
        eventIds.has(e.id) ||
        typeof e.at !== 'string' ||
        !Number.isFinite(Date.parse(e.at)) ||
        !Number.isSafeInteger(e.revision) ||
        e.revision < 0 ||
        !['answer', 'restore', 'skip', 'settings'].includes(e.kind)
      )
        fail('备份事件无效或重复');
      eventIds.add(e.id);
      if (e.kind === 'answer') validateJudgment(e.judgment, ids);
    }
    for (const log of restored.logs) {
      const event = b.events.find((e) => e.id === log.id);
      if (!event?.judgment || JSON.stringify(event.judgment) !== JSON.stringify(log))
        fail('备份学习记录缺少一致的原始判断');
    }
    return this.transaction(
      requestId,
      revision,
      { backup: raw, revision, requestId },
      (current) => {
        for (const e of b.events!) this.addEvent(e);
        this.addEvent({
          id: randomUUID(),
          at: now.toISOString(),
          kind: 'restore',
          revision: current.revision + 1,
        });
        return structuredClone(restored);
      },
    );
  }
  close() {
    this.db.close();
  }
}
