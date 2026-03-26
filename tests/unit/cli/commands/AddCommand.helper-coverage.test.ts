import { AddCommand } from '@cli/commands/AddCommand';
import { describe, expect, it, vi } from 'vitest';

describe('AddCommand helper coverage', () => {
  const helpers = (AddCommand as any)._helpers as {
    isPascalCaseBase: (value: string) => boolean;
    toSafeSnakeCase: (value: string) => string;
    stripSuffix: (value: string, suffix: string) => string;
    skipInlineWhitespace: (value: string, startIndex: number) => number;
    findMatchingObjectBrace: (value: string, startIndex: number) => number | undefined;
    findRouteBlockBounds: (
      value: string
    ) => { blockStart: number; innerStart: number; innerEnd: number; blockEnd: number } | undefined;
    hasTrailingMiddlewaresTypeCast: (value: string) => boolean;
    promptMiddlewareConfig: () => Promise<unknown>;
    registerMiddlewareRouteKey: (
      configSource: string,
      middlewareName: string,
      middlewareKey: string
    ) => { content: string; updated: boolean };
  };

  it('covers pascal case validation and snake normalization edge cases', () => {
    expect(helpers.isPascalCaseBase('UserProfile2')).toBe(true);
    expect(helpers.isPascalCaseBase('User-Profile')).toBe(false);

    expect(helpers.toSafeSnakeCase('__A--B__C__')).toBe('a_b_c');
    expect(helpers.stripSuffix('UserMiddleware', 'Middleware')).toBe('User');
    expect(helpers.stripSuffix('User', 'Middleware')).toBe('User');
  });

  it('covers whitespace and route block parsing helpers', () => {
    expect(helpers.skipInlineWhitespace('x \t\r  y', 1)).toBe(6);
    expect(helpers.skipInlineWhitespace('xy', 1)).toBe(1);

    expect(helpers.findMatchingObjectBrace('before { one { two } three } after', 7)).toBe(27);
    expect(helpers.findMatchingObjectBrace('before { one { two } three', 7)).toBeUndefined();

    const routeBounds = helpers.findRouteBlockBounds(
      'export default {\n  route: {\n    jwt: handler,\n  },\n} as MiddlewaresType;'
    );
    expect(routeBounds).toEqual(
      expect.objectContaining({
        blockStart: 19,
        innerEnd: 48,
        blockEnd: 50,
      })
    );
    expect(routeBounds?.innerStart).toBeGreaterThan(routeBounds?.blockStart ?? 0);

    expect(helpers.findRouteBlockBounds('export default { route: {} }')).toBeUndefined();
    expect(helpers.hasTrailingMiddlewaresTypeCast('export default {} as MiddlewaresType;')).toBe(
      true
    );
    expect(helpers.hasTrailingMiddlewaresTypeCast('export default {}')).toBe(false);
  });

  it('covers middleware prompt validation and route-key registration branch', async () => {
    const inquirer = await import('inquirer');
    const promptSpy = vi.spyOn(inquirer.default, 'prompt').mockImplementation((questions: any) => {
      const nameQuestion = questions.find((question: any) => question.name === 'name');
      expect(nameQuestion.validate('AuditMiddleware')).toBe(true);
      expect(nameQuestion.validate('Audit')).toBe('Must be PascalCase ending with "Middleware"');
      return Promise.resolve({ name: 'AuditMiddleware' });
    });

    await helpers.promptMiddlewareConfig();

    const updated = helpers.registerMiddlewareRouteKey(
      `import type { MiddlewaresType } from '@config/middleware';

export default {
  route: {
  },
} as MiddlewaresType;
`,
      'AuditMiddleware',
      'auditMiddleware'
    );

    expect(updated.updated).toBe(true);
    expect(updated.content).toContain('auditMiddleware: AuditMiddleware');

    promptSpy.mockRestore();
  });
});
