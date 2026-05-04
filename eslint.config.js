import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Root ESLint config - baseline rules for apps/ingest, packages/shared,
// scripts/, and any cross-cutting files. apps/api and apps/web have own
// configs (NestJS scaffold + Vite scaffold) which take precedence via
// ESLint flat-config walk-up resolution.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/build/**',
      '**/.next/**',
      'apps/api/**',
      'apps/web/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // Node globals for build/tooling files (scripts, config files)
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,mjs,cjs}', '*.config.{ts,mts}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
    },
  },
);
