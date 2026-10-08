import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './core.ts';
import { StudyStore } from './store.ts';
import { studyView } from './view.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files: Record<string, [string, string]> = {
  '/': ['web/index.html', 'text/html'],
  '/style.css': ['web/style.css', 'text/css'],
  '/app.js': ['dist/app.js', 'text/javascript'],
};
async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8_000_000) fail('文件超过8MB', 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    throw Object.assign(new Error('JSON格式不正确', { cause: e }), { status: 400 });
  }
}
export function createApp(store: StudyStore) {
  return http.createServer(async (req, res) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(data));
    };
    try {
      const port = req.socket.localPort,
        hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host ?? '')) fail('只接受本机访问', 403);
      const route = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'POST') {
        if (
          req.headers['x-study-client'] !== '1' ||
          !req.headers['content-type']?.startsWith('application/json')
        )
          fail('请求格式不正确', 403);
        if (req.headers.origin && !hosts.map((h) => 'http://' + h).includes(req.headers.origin))
          fail('请求来源不正确', 403);
        const body = await readBody(req);
        if (route === '/api/command') {
          const state = store.command(body);
          send(200, studyView(state, store.deck));
          return;
        }
        if (route === '/api/restore') {
          if (!body || typeof body !== 'object') fail('恢复请求不正确');
          const b = body as Record<string, unknown>;
          const state = store.restore(b.backup, b.revision as number, b.requestId as string);
          send(200, studyView(state, store.deck));
          return;
        }
        fail('接口不存在', 404);
      }
      if (req.method !== 'GET') fail('不支持此方法', 405);
      if (route === '/api/state') {
        send(200, studyView(store.state(), store.deck));
        return;
      }
      if (route === '/api/backup') {
        send(200, store.backup());
        return;
      }
      if (route === '/api/events') {
        send(200, { events: store.events() });
        return;
      }
      if (route === '/health') {
        send(200, { ok: true, deckId: store.deck.id });
        return;
      }
      const file = files[route];
      if (!file) fail('页面不存在', 404);
      const content = readFileSync(path.join(root, file[0]));
      res.writeHead(200, {
        'Content-Type': file[1] + '; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      res.end(content);
    } catch (error) {
      const e = error as Error & { status?: number };
      if (!res.headersSent)
        send(e.status ?? 500, { error: e.status ? e.message : '本地服务出错，请查看终端' });
      else res.end();
    }
  });
}
