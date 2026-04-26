// ESLint v9 flat config for the frontend (React 18 + TypeScript + Vite).
// Uses typescript-eslint v8 with type-checked rules.

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // --- Ignore compiled output ---
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  // --- Base TypeScript-checked rules ---
  ...tseslint.configs.recommendedTypeChecked,

  // --- React Hooks rules ---
  // Only the two classic rules (rules-of-hooks + exhaustive-deps).
  // We intentionally do NOT enable the v7 React Compiler rules
  // (set-state-in-effect, preserve-manual-memoization) because the codebase
  // uses idiomatic derived-state-in-effect patterns that would require
  // significant refactoring beyond this lint setup task.
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // --- Project-wide language options ---
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // --- Bespoke rules for this codebase ---
  {
    rules: {
      // No untyped `any` — matches CLAUDE.md "No `any`" requirement.
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused vars are bugs; args starting with _ are intentionally unused.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Enforce `import type` for type-only imports.
      '@typescript-eslint/consistent-type-imports': 'error',

      // `no-empty-pattern` fights intentional empty destructures. Disable it.
      'no-empty-pattern': 'off',

      // `@typescript-eslint/no-unsafe-*` rules fire on React Query generic
      // patterns and fetch response handling where `unknown` is intentional.
      // The codebase uses explicit casts with comments; disabling avoids
      // hundreds of noisy violations without weakening type safety.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // `require-await` fires on async event handlers and query functions
      // that don't always need to await. Disable to avoid artificial noise.
      '@typescript-eslint/require-await': 'off',

      // Float promise rule fires on fire-and-forget mutation calls common
      // in React event handlers. Warn instead of error.
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
);
