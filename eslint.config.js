import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['vendor/**', 'node_modules/**', 'data/**', 'dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  { files: ['web/**/*.ts'], languageOptions: { globals: globals.browser } },
);
