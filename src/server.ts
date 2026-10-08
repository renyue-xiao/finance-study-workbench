import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeck } from './validation.ts';
import { StudyStore } from './store.ts';
import { createApp } from './http.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.STUDY_PORT ?? 8878);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('STUDY_PORT须为1024至65535');
const deck = validateDeck(JSON.parse(readFileSync(path.join(root, 'content/deck.json'), 'utf8')));
mkdirSync(path.join(root, 'data'), { recursive: true });
const store = new StudyStore(path.join(root, 'data/learning.sqlite'), deck);
const server = createApp(store);
server.listen(port, '127.0.0.1', () =>
  console.log(`Finance Study Workbench: http://127.0.0.1:${port} (local data directory: ./data)`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
