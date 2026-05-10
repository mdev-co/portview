import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Root ESLint config - baseline rules for packages/shared, scripts/,
// and any cross-cutting files. apps/api and apps/web have own configs
// (NestJS scaffold + Vite scaffold) which take precedence via ESLint
// flat-config walk-up resolution.
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
    languageOptions: {
      parserOptions: {
        // Needed when multiple tsconfig roots exist (workspace + apps/*).
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
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
  // packages/shared must stay framework-agnostic so it can run in any host
  // (web, NestJS Node, future React Native). Block framework imports here.
  {
    files: ['packages/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'packages/shared must stay framework-agnostic.' },
            { name: 'react-dom', message: 'packages/shared must stay framework-agnostic.' },
            { name: 'vite', message: 'packages/shared must stay framework-agnostic.' },
          ],
          patterns: [
            { group: ['react/*'], message: 'packages/shared must stay framework-agnostic.' },
            { group: ['react-dom/*'], message: 'packages/shared must stay framework-agnostic.' },
            { group: ['@nestjs/*'], message: 'packages/shared must stay framework-agnostic.' },
            { group: ['vite/*'], message: 'packages/shared must stay framework-agnostic.' },
          ],
        },
      ],
    },
  },
);
