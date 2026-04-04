import { describe, expect, it } from 'vitest';

import { zintrustAppEslintConfig } from '../../../packages/governance/src/eslint';

type EslintConfigLike = {
  files?: string[];
  rules?: Record<string, unknown>;
};

const getRestrictedImportsRule = (configs: unknown[]): unknown => {
  for (const config of configs) {
    const typedConfig = config as EslintConfigLike;
    if (typedConfig.files?.includes('tests/**/*.ts') === true) {
      continue;
    }

    const rules = typedConfig.rules;
    if (rules !== undefined && 'no-restricted-imports' in rules) {
      return rules['no-restricted-imports'];
    }
  }

  return undefined;
};

describe('zintrustAppEslintConfig', () => {
  it('keeps path alias enforcement enabled by default', () => {
    const configs = zintrustAppEslintConfig();
    expect(getRestrictedImportsRule(configs)).toEqual([
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
    ]);
  });

  it('allows scaffolds to opt out of path alias enforcement', () => {
    const configs = zintrustAppEslintConfig({ enforcePathAliases: false });
    expect(getRestrictedImportsRule(configs)).toBe('off');
  });
});
