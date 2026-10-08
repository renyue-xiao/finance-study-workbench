import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
await mkdir('dist', { recursive: true });
const source = await readFile('web/app.ts', 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    removeComments: false,
  },
  reportDiagnostics: true,
});
if (result.diagnostics?.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
await writeFile('dist/app.js', result.outputText);
console.log('Built local browser application');
