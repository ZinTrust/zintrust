import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint Configuration for Zintrust Framework
 * Enforces security, performance, memory management, and best practices
 *
 * Key Areas:
 * - Security: SQL injection, XSS, unsafe operations
 * - Performance: Inefficient patterns, N+1 queries, memory leaks
 * - Memory Management: EventListener cleanup, resource disposal
 * - Code Quality: Type safety, complexity, maintainability
 * - Framework Conventions: Path aliases, logger usage, sealed namespaces
 */

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
      // Generated during CLI tests/benchmarks in CI; should never be linted.
      'tests/cli/test-factories-*',
      'tests/cli/test-factories-*/**',
      'vitest.config.ts',
      'eslint.config.mjs',
      'worker-configuration.d.ts',
      '.scannerwork/**',
      'check_vi.ts',
      'dev/**',
      'simulate/**',
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
        NodeJS: 'readonly',
        BufferEncoding: 'readonly',
        RequestInit: 'readonly',
      },
    },
  },
  // Enable type checking for source and app files only
  {
    files: ['src/**/*.ts', 'app/**/*.ts', 'routes/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // ==================== SECURITY RULES ====================
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowStaticOnly: false }],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ==================== PERFORMANCE RULES ====================
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'no-negated-condition': 'error',
      'no-var': 'error', // Use const/let only
      'prefer-const': 'warn', // Encourage immutability
      'no-plusplus': 'off', // Allow i++ in loops
      'no-multi-assign': 'warn', // a = b = c = 0 can hide intent
      'no-param-reassign': ['warn', { props: false }], // Don't reassign params
      'no-shadow': 'off', // TypeScript handles this better
      '@typescript-eslint/no-shadow': ['warn', { ignoreTypeValueShadow: true }],
      'prefer-arrow-callback': 'warn', // Better lexical this binding
      'prefer-spread': 'warn', // Avoid .apply()
      'prefer-rest-params': 'warn', // Use ...args

      // ==================== MEMORY LEAK PREVENTION ====================
      'no-unmodified-loop-condition': 'warn', // Infinite loops
      'no-unused-expressions': ['warn', { allowTernary: true }],

      // ==================== COMPLEXITY & MAINTAINABILITY ====================
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
      'max-nested-callbacks': ['warn', 3],
      'max-depth': ['warn', 4],
      complexity: ['error', 15],
      'cyclomatic-complexity': 'off', // Covered by complexity rule
      'no-nested-ternary': 'warn',
      'no-ternary': 'off',

      // ==================== ERROR HANDLING & LOGGING ====================
      'no-restricted-syntax': [
        'error',
        // {
        //   selector:
        //     "CatchClause BlockStatement CallExpression[callee.object.name='throw'][callee.property.name='error']",
        //   message:
        //     'Do not use Logger.error() in catch blocks. Use throw ErrorFactory.createTryCatchError() instead, which handles logging automatically.',
        // },
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message:
            'Do not throw raw Errors. Use ErrorFactory.create*Error() methods (e.g., createValidationError, createSecurityError).',
        },
        {
          selector: 'ExportNamedDeclaration > ClassDeclaration:not([superClass])',
          message:
            'Exported classes must extend a base class (Model, Controller, etc.). Use Sealed Namespace Objects for utilities and singletons.',
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message:
            'eval() is a security risk and performance bottleneck. Use alternative approaches.',
        },
        {
          selector: "CallExpression[callee.name='setTimeout'][arguments.length=2]",
          message:
            'setTimeout() without proper cleanup can cause memory leaks. Ensure cleanup in error handlers.',
        },
        {
          selector: "Identifier[name='innerHTML']",
          message: 'innerHTML is an XSS vulnerability. Use textContent or createElement instead.',
        },
      ],

      // ==================== FRAMEWORK CONVENTIONS ====================
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

      // ==================== OTHER BEST PRACTICES ====================
      'no-await-in-loop': 'warn', // Usually indicates performance issue (N+1 queries)
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      // Allow `import type { ... }` alongside a value import from the same module.
      // This prevents false positives when using separate type-only imports.
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      'no-empty-function': ['warn', { allow: ['arrowFunctions', 'constructors'] }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-fallthrough': 'error',
      'no-implicit-coercion': 'warn', // Explicit type conversion
      'no-invalid-this': 'off', // TypeScript handles this
      'no-loop-func': 'warn',
      'no-multi-spaces': 'warn',
      'no-new': 'warn', // Constructor side effects
      'no-new-func': 'error', // Function() is like eval()
      'no-new-wrappers': 'error', // new String(), new Boolean()
      'no-octal-escape': 'error',
      'no-restricted-properties': [
        'warn',
        {
          object: 'arguments',
          property: 'callee',
          message: 'arguments.callee is deprecated and disallowed in strict mode.',
        },
        {
          object: 'global',
          property: 'isFinite',
          message: 'Use Number.isFinite() instead of global isFinite().',
        },
        {
          object: 'global',
          property: 'isNaN',
          message: 'Use Number.isNaN() instead of global isNaN().',
        },
      ],
      'no-return-assign': 'error',
      'no-return-await': 'off', // Covered by @typescript-eslint/return-await
      'no-script-url': 'error',
      'no-sequences': 'warn', // Comma operator
      'no-throw-literal': 'error', // throw new Error() instead of strings
      'no-undef-init': 'warn',
      'no-undef': 'error',
      'no-undefined': 'off',
      'no-underscore-dangle': 'off', // Private fields convention
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unused-labels': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
  // Typed linting rules requiring project configuration (applies to src/, app/, and routes/)
  {
    files: ['src/**/*.ts', 'app/**/*.ts', 'routes/**/*.ts'],
    rules: {
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/return-await': ['warn', 'in-try-catch'],
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },
  {
    files: ['bin/**/*.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['app/**/*.ts', 'routes/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        Router: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/require-await': 'off',
      'no-undef': 'off',
      'no-duplicate-imports': ['warn', { allowSeparateTypeImports: true }],
    },
  },
  {
    files: ['src/cli/logger/Logger.ts', 'tests/**/*.ts', 'src/performance/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/config/features.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        // Tests are not part of the main tsconfig project; disable project-based parsing here.
        // This avoids "file was not found in any of the provided project(s)" parsing errors.
        project: false,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/return-await': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
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
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      'no-await-in-loop': 'warn', // Connection pooling N+1 queries
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
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
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
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: [
      'src/cli/PromptHelper.ts',
      'src/cli/scaffolding/ProjectScaffolder.ts',
      'src/routing/**/*.ts',
      'src/cli/commands/ConfigCommand.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['src/runtime/adapters/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off', // Allow setTimeout for graceful shutdown
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['src/security/XssProtection.ts', 'tests/**/*.ts'],
    rules: {
      'no-script-url': 'off', // Intentionally testing XSS scenarios
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-throw-literal': 'off',
      'no-duplicate-imports': 'off',
    },
  },
  {
    files: ['src/microservices/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'no-await-in-loop': 'warn',
      '@typescript-eslint/no-shadow': 'off',
    },
  },
  {
    files: ['src/performance/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-shadow': 'off',
      'no-await-in-loop': 'warn',
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
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
    },
  }
);
