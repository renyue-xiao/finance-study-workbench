import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = {
  'vendor/fsrs.mjs': 'ad4a4b3b7e259fcbf02764454c8f9db4ea3bf5aae2f473198129ecb7728f1a19',
  'vendor/fsrs.d.mts': '86619bd94f12a259832e2d3e1e7cacdc392174410d674e5999729e13889a4f41',
  'vendor/FSRS-LICENSE.txt': '8b83a73dd2894ff553d6de6113064b3ad9dfad3f839837b61f3b183881131d01',
};
for (const [file, expected] of Object.entries(files)) {
  const hash = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
  if (hash !== expected) throw new Error(file + ' differs from verified ts-fsrs 5.4.2 source');
  console.log(file + ': verified');
}
