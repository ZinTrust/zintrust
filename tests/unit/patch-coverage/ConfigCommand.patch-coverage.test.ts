import { describe, expect, it, vi } from 'vitest';

describe('ConfigCommand behaviors', () => {
  it('parse/format and handleGet/Set/List behave with a mock manager', async () => {
    vi.resetModules();

    vi.doMock('@cli/config/ConfigValidator', () => ({
      ConfigValidator: { validate: () => ({ valid: true }), validateValue: () => undefined },
    }));
    vi.doMock('@cli/PromptHelper', () => ({
      PromptHelper: {
        confirm: async () => true,
        chooseFrom: async () => '(Done)',
        textInput: async () => undefined,
      },
    }));
    vi.doMock('@cli/ErrorHandler', () => ({
      ErrorHandler: {
        usageError: () => {},
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));
    vi.doMock('@config/logger', () => ({
      Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
    }));

    const mod = await import('../../../../src/cli/commands/ConfigCommand');
    const cmd = mod.ConfigCommand.create();

    // parse and format
    expect(cmd.parseConfigValue('true')).toBe(true);
    expect(cmd.parseConfigValue('123')).toBe(123);
    expect(typeof cmd.formatConfigValue({ a: 1 })).toBe('string');

    const manager: any = {
      get: (k: string) => (k === 'x' ? 1 : undefined),
      set: vi.fn(),
      save: vi.fn(),
      getConfig: () => ({ a: 1, b: 'two' }),
      getAllKeys: () => ['a', 'b'],
      export: () => '{ }',
    };

    // handleGet: existing
    cmd.handleGet(manager, 'x');
    // handleGet: missing
    cmd.handleGet(manager, 'missing');

    // handleSet: valid
    cmd.handleSet(manager, 'a', 'true');

    // handleList
    cmd.handleList(manager, { json: true, showDefaults: true } as any);
  });
});
