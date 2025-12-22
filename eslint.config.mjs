import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.next/**',
      '.git/**',
      '.vscode/**',
      '.github/**',
      '.idea/**',
      '*.log',
      '.DS_Store',
      'wrangler.jsonc',
      'docs-website/**',
      'scripts/**',
      'vitest.config.ts',
      'eslint.config.mjs',
      'worker-configuration.d.ts',
      '.scannerwork/**',
      'check_vi.ts',
      'dev/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'no-negated-condition': 'error',
      'max-len': [
        'error',
        {
          code: 120,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
      'max-lines-per-function': ['error', { max: 70, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 15],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CatchClause:not(:has(CallExpression[callee.object.name='Logger'][callee.property.name='error'])):not(:has(CallExpression[callee.object.type='MemberExpression'][callee.object.property.name='logger'][callee.property.name='error']))",
          message:
            'Every catch block must include a Logger.error() or this.logger?.error() call to ensure proper error tracking.',
        },
      ],
    },
  },
  {
    files: [
      'bin/**/*.ts',
      'scripts/**/*.ts',
      'scripts/**/*.mjs',
      'app/Middleware/index.ts',
      'app/Middleware/ProfilerMiddleware.ts',
      'bin/zintrust-microservices.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['bin/**/*.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/cli/logger/Logger.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['src/orm/adapters/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
        Database: 'readonly', // better-sqlite3
        Statement: 'readonly',
        Connection: 'readonly', // mysql2
        Pool: 'readonly',
        Client: 'readonly', // pg
        ConnectionPool: 'readonly', // mssql
        D1Database: 'readonly', // Cloudflare D1
        D1Result: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    files: ['src/runtime/adapters/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
        // AWS Lambda
        AWSLambda: 'readonly',
        context: 'readonly',
        event: 'readonly',
        callback: 'readonly',
        // Cloudflare Workers
        Cloudflare: 'readonly',
        FetchEvent: 'readonly',
        ExtendableEvent: 'readonly',
        // Deno
        Deno: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    files: ['src/functions/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
        ...globals.browser,
        // AWS Lambda
        AWSLambda: 'readonly',
        context: 'readonly',
        event: 'readonly',
        callback: 'readonly',
        // Cloudflare Workers
        Cloudflare: 'readonly',
        FetchEvent: 'readonly',
        ExtendableEvent: 'readonly',
        // Deno
        Deno: 'readonly',
        // Database connections
        Database: 'readonly',
        Statement: 'readonly',
        Connection: 'readonly',
        Pool: 'readonly',
        Client: 'readonly',
        ConnectionPool: 'readonly',
        D1Database: 'readonly',
        D1Result: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Please use path aliases (e.g., @orm/Model) instead of relative imports.',
            },
          ],
        },
      ],
    },
  }
);
