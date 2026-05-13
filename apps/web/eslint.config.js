import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Block dangerouslySetInnerHTML at the linter so a future PR
      // cannot quietly bypass React's default JSX escaping. Audit for
      // the Vercel deploy hardening pass found zero occurrences and
      // we keep it that way. If a genuine use-case appears (Markdown
      // render, third-party HTML snippet), the PR introducing it adds
      // a sanitizer and a scoped eslint-disable with the rationale.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'dangerouslySetInnerHTML bypasses JSX escaping. Sanitize with DOMPurify and add a scoped override with rationale.',
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/shell/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
]);
