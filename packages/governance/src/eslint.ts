import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export type ZintrustEslintOptions = Readonly<{
  tsconfigPath?: string;
  tsconfigRootDir?: string;
}>;

const DEFAULT_IGNORES: string[] = [
  'node_modules/**',
  'dist/**',
  '**/dist/**',
  'coverage/**',
  '.git/**',
  '.vscode/**',
  '.idea/**',
  '*.log',
  '.DS_Store',
];

const baseLanguageGlobals = (): unknown => ({
  languageOptions: {
    globals: {
      ...globals.node,
      ...globals.es2022,
    },
  },
});

const typeAwareAppConfig = (tsconfigPath: string, tsconfigRootDir: string): unknown => ({
  files: ['src/**/*.ts', 'app/**/*.ts', 'routes/**/*.ts', 'config/**/*.ts', 'database/**/*.ts'],
  languageOptions: {
    parserOptions: {
      project: tsconfigPath,
      tsconfigRootDir,
    },
  },
});

const testGlobalsConfig = (): unknown => ({
  files: ['tests/**/*.ts'],
  languageOptions: {
    globals: {
      describe: 'readonly',
      it: 'readonly',
      test: 'readonly',
      expect: 'readonly',
      vi: 'readonly',
      beforeAll: 'readonly',
      afterAll: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
    },
  },
  rules: {
    'no-restricted-imports': 'off',
    'no-empty': 'off',
  },
});

const zintrustRulesConfig = (): unknown => ({
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': 'error',
    eqeqeq: ['error', 'always'],
    'prefer-const': 'warn',

    // Keep app code on aliases (relative imports are allowed in tests).
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['./*', '../*'],
            message:
              'Please use path aliases (e.g., @app/Controllers/UserController) instead of relative imports.',
          },
        ],
      },
    ],

    // Avoid raw throw Error(...) in app code.
    'no-restricted-syntax': [
      'warn',
      {
        selector: "ThrowStatement > NewExpression[callee.name='Error']",
        message: 'Do not throw raw Errors. Prefer ErrorFactory.create*Error() from @zintrust/core.',
      },
      {
        selector: "CallExpression[callee.property.name='getParam']",
        message: "Use req.get('key') or req.data() instead of req.getParam()",
      },
      {
        selector: "CallExpression[callee.property.name='getQueryParam']",
        message: "Use req.get('key') or req.data() instead of req.getQueryParam()",
      },
      {
        selector: "CallExpression[callee.property.name='getBody']",
        message: 'Use req.data() instead of req.getBody()',
      },
      {
        selector: "CallExpression[callee.name='getParam']",
        message: "Use req.get('key') or req.data() instead of getParam(req, ...)",
      },
    ],

    // Useful but intentionally lenient by default.
    'max-nested-callbacks': ['warn', 3],
  },
});

export function zintrustAppEslintConfig(opts: ZintrustEslintOptions = {}): unknown[] {
  const tsconfigPath = opts.tsconfigPath ?? './tsconfig.json';
  const tsconfigRootDir = opts.tsconfigRootDir ?? process.cwd();

  return [
    {
      ignores: DEFAULT_IGNORES,
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.strict,
    baseLanguageGlobals(),
    // Enable type-aware linting for app source.
    typeAwareAppConfig(tsconfigPath, tsconfigRootDir),
    testGlobalsConfig(),
    zintrustRulesConfig(),
  ];
}
