import type { PublicView } from '../src/view.ts';
import type { Command } from '../src/model.ts';
const element = <T extends HTMLElement = HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error('缺少界面元素 ' + id);
  return node as T;
};
let view: PublicView | null = null,
  busy = false,
  page = 'plan',
  draft = '',
  restoreData: unknown = null;
const field = element<HTMLFieldSetElement>('workspace');
const show = (id: string, visible: boolean) => {
  element(id).hidden = !visible;
};
const message = (text: string) => {
  element('message').textContent = text;
  show('message', !!text);
};
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Study-Client': '1' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '请求失败');
  return result as T;
}
async function load() {
  view = await request<PublicView>('/api/state');
  render();
}
function text(id: string, value: string) {
  element(id).textContent = value;
}
function metric(label: string, value: string, detail: string) {
  const node = document.createElement('article');
  const title = document.createElement('span'),
    number = document.createElement('strong'),
    small = document.createElement('small');
  title.textContent = label;
  number.textContent = value;
  small.textContent = detail;
  node.append(title, number, small);
  return node;
}
function render() {
  if (!view) return;
  const { plan, session, current } = view;
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  for (const name of ['plan', 'study', 'records']) show(name + '-page', page === name);
  element('plan-summary').replaceChildren(
    metric('今日新词', `${plan.newDone} / ${plan.newTarget}`, '按词量分摊到新词截止日前'),
    metric('到期复习', String(plan.reviewDue), `今日已复习 ${plan.reviewDone} 次`),
    metric('首轮进度', `${plan.firstPassDone} / ${plan.totalWords}`, '至少判断过一次，不代表掌握'),
  );
  text(
    'plan-details',
    `${plan.today}（北京时间）：还有 ${plan.newRemaining} 个新词、${plan.reviewDue} 个已到期复习；今天稍后还有 ${plan.reviewLaterToday} 个复习到期。预计剩余 ${plan.groupsRemaining} 组，每组最多 ${view.settings.groupSize} 项。${plan.newStopDate} 起新组只安排复习。`,
  );
  text(
    'next-review',
    plan.nextReviewAt
      ? '下次复习时间：' + new Date(plan.nextReviewAt).toLocaleString('zh-CN')
      : '暂无已安排的后续复习。先完成首轮判断。',
  );
  const active = !!session && session.phase !== 'complete';
  show('continue', active);
  element<HTMLButtonElement>('start-new').disabled = active;
  element<HTMLButtonElement>('start-review').disabled = active;
  for (const [id, key] of [
    ['start-date', 'startDate'],
    ['exam-date', 'examDate'],
    ['stop-days', 'newStopDays'],
    ['group-size', 'groupSize'],
  ] as const) {
    element<HTMLInputElement>(id).value = String(view.settings[key]);
    element<HTMLInputElement>(id).disabled = active;
  }
  const phase = session?.phase,
    answerShown =
      page === 'study' && !session?.paused && (phase === 'answer' || phase === 'feedback');
  text(
    'group-progress',
    session
      ? `本组已判断 ${session.judged.length} 项 · 剩余 ${session.queue.length} 项`
      : '尚未开始',
  );
  text('card-kind', current?.kind === 'question' ? '自编金融小题' : '金融英语 · 先回想中文');
  text(
    'prompt',
    session?.paused
      ? '当前学习已暂停'
      : phase === 'waiting'
        ? '上一组错词正在等待复问'
        : phase === 'complete'
          ? '本组已完成'
          : (current?.front ?? '先从今日计划开始一组'),
  );
  element('answer').replaceChildren();
  element('options').replaceChildren();
  if (current && page === 'study' && !session?.paused) {
    if (current.options)
      for (const option of current.options) {
        const label = document.createElement('label'),
          input = document.createElement('input'),
          span = document.createElement('span');
        input.type = 'radio';
        input.name = 'option';
        input.value = option.id;
        input.checked = (phase === 'prompt' ? draft : session?.draft) === option.id;
        input.disabled = phase !== 'prompt';
        input.addEventListener('change', () => {
          draft = option.id;
        });
        span.textContent = option.id + ' · ' + option.label;
        label.append(input, span);
        element('options').append(label);
      }
    if (answerShown && current.back) {
      const title = document.createElement('h3'),
        p = document.createElement('p');
      title.textContent = current.back;
      p.textContent = current.explanation ?? '';
      element('answer').append(title, p);
    }
  }
  show('reveal', !!active && !session?.paused && phase === 'prompt');
  show('wrong', !!active && !session?.paused && phase === 'answer');
  show('correct', !!active && !session?.paused && phase === 'answer');
  show('advance', !!active && !session?.paused && (phase === 'feedback' || phase === 'waiting'));
  show('skip', !!active && !session?.paused && (phase === 'prompt' || phase === 'answer'));
  show('pause', active);
  show('back-plan', !active || !!session?.paused);
  text('advance', phase === 'waiting' ? '检查复问时间 →' : '下一个词 →');
  text(
    'study-hint',
    session?.paused
      ? '回到计划页，点击继续当前组。'
      : phase === 'feedback'
        ? '已记录记错。读完解释后再前进；前进不会追加一次判断。'
        : phase === 'waiting'
          ? '上一组错词先复问，至少离开错误反馈10分钟后才可继续。'
          : phase === 'prompt'
            ? '↓ 显示答案，不会评分。想好后再揭示。'
            : phase === 'answer'
              ? '对照自己的回想：← 记错，→ 记对。题目选错会按记错保存。'
              : '到计划页查看下一组与复习安排。',
  );
  text(
    'review-stage',
    view.reinforcement
      ? `跨组累计记对 ${view.reinforcement.successes} / 5 · 下次安排 ${new Date(view.reinforcement.due).toLocaleString('zh-CN')}`
      : '首次记对后直接进入FSRS长期复习；错词先做跨组巩固。',
  );
  element('record-rows').replaceChildren(
    ...view.logs.map((log) => {
      const tr = document.createElement('tr');
      for (const value of [
        new Date(log.at).toLocaleString('zh-CN'),
        log.cardId,
        log.correct ? '记对' : log.forcedWrong ? '选项不符，记错' : '记错',
        log.isNew ? '首轮' : '复习',
      ]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      return tr;
    }),
  );
}
async function operate(command: Omit<Command, 'revision' | 'requestId' | 'sessionId' | 'turn'>) {
  if (busy || !view) return;
  busy = true;
  field.disabled = true;
  message('');
  try {
    const next = await request<PublicView>('/api/command', {
      ...command,
      revision: view.revision,
      requestId: crypto.randomUUID(),
      sessionId: view.session?.id,
      turn: view.session?.turn,
    });
    view = next;
    draft = '';
    if (['start', 'resume'].includes(command.action)) page = 'study';
    if (command.action === 'pause') page = 'plan';
    if (command.action === 'settings') message('设置已保存，已有学习记录保持。');
    render();
    if (page === 'study') element('card').focus();
  } catch (error) {
    message((error as Error).message);
    try {
      await load();
    } catch {
      message('连接失败，请确认本地服务仍在运行；不要重复判断，恢复连接后刷新。');
    }
  } finally {
    busy = false;
    field.disabled = false;
  }
}
for (const [id, action] of [
  ['reveal', 'reveal'],
  ['advance', 'advance'],
  ['skip', 'skip'],
  ['pause', 'pause'],
  ['continue', 'resume'],
] as const)
  element(id).addEventListener(
    'click',
    () => void operate({ action, ...(action === 'reveal' ? { draft } : {}) }),
  );
element('correct').addEventListener(
  'click',
  () => void operate({ action: 'answer', correct: true }),
);
element('wrong').addEventListener(
  'click',
  () => void operate({ action: 'answer', correct: false }),
);
element('start-new').addEventListener(
  'click',
  () => void operate({ action: 'start', mode: 'new' }),
);
element('start-review').addEventListener(
  'click',
  () => void operate({ action: 'start', mode: 'review' }),
);
element('back-plan').addEventListener('click', () => {
  page = 'plan';
  render();
});
document.querySelectorAll<HTMLButtonElement>('nav button').forEach((button) =>
  button.addEventListener('click', () => {
    if (busy) return;
    page = button.dataset.page ?? 'plan';
    render();
  }),
);
element('settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void operate({
    action: 'settings',
    settings: {
      startDate: element<HTMLInputElement>('start-date').value,
      examDate: element<HTMLInputElement>('exam-date').value,
      newStopDays: Number(element<HTMLInputElement>('stop-days').value),
      groupSize: Number(element<HTMLInputElement>('group-size').value),
    },
  });
});
document.addEventListener('keydown', (event) => {
  if (
    event.repeat ||
    busy ||
    page !== 'study' ||
    !view?.session ||
    view.session.paused ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
  )
    return;
  const phase = view.session.phase;
  let action: Parameters<typeof operate>[0] | null = null;
  if (event.key === 'ArrowDown')
    action =
      phase === 'prompt'
        ? { action: 'reveal', draft }
        : phase === 'answer'
          ? { action: 'skip' }
          : ['feedback', 'waiting'].includes(phase)
            ? { action: 'advance' }
            : null;
  if (event.key === 'ArrowRight')
    action =
      phase === 'answer'
        ? { action: 'answer', correct: true }
        : phase === 'feedback'
          ? { action: 'advance' }
          : null;
  if (event.key === 'ArrowLeft' && phase === 'answer')
    action = { action: 'answer', correct: false };
  if (action) {
    event.preventDefault();
    void operate(action);
  }
});
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportData(route: string, name: string) {
  if (busy) return;
  busy = true;
  field.disabled = true;
  try {
    download(await request(route), name);
    message('已生成下载，请保存到自己的备份目录。');
  } catch (e) {
    message((e as Error).message);
  } finally {
    busy = false;
    field.disabled = false;
  }
}
element('backup').addEventListener(
  'click',
  () => void exportData('/api/backup', 'finance-study-backup.json'),
);
element('events').addEventListener(
  'click',
  () => void exportData('/api/events', 'finance-study-events.json'),
);
element<HTMLInputElement>('restore-file').addEventListener('change', async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > 8_000_000) throw new Error('备份超过8MB');
    restoreData = JSON.parse(await file.text());
    text('restore-description', `已选择 ${file.name}，确认后由服务端完整校验并恢复。`);
    show('restore-preview', true);
  } catch (e) {
    message((e as Error).message);
    restoreData = null;
    show('restore-preview', false);
  }
});
element('restore-cancel').addEventListener('click', () => {
  restoreData = null;
  show('restore-preview', false);
});
element('restore-confirm').addEventListener('click', async () => {
  if (!view || !restoreData || busy) return;
  busy = true;
  field.disabled = true;
  try {
    view = await request('/api/restore', {
      backup: restoreData,
      revision: view.revision,
      requestId: crypto.randomUUID(),
    });
    restoreData = null;
    show('restore-preview', false);
    message('恢复完成。原始事件已保留并合并。');
    render();
  } catch (e) {
    message((e as Error).message);
    await load().catch(() => {});
  } finally {
    busy = false;
    field.disabled = false;
  }
});
field.disabled = true;
load()
  .catch((e) => message((e as Error).message))
  .finally(() => {
    field.disabled = false;
  });
