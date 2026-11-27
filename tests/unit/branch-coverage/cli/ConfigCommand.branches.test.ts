/* eslint-disable no-empty-function -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/config/ConfigManager');
vi.mock('@cli/config/ConfigValidator');
vi.mock('@cli/ErrorHandler');
vi.mock('@cli/PromptHelper');
vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('chalk', () => ({
  default: {
    green: (value: string) => value,
    yellow: (value: string) => value,
    red: (value: string) => value,
    blue: (value: string) => value,
    cyan: (value: string) => value,
    bold: (value: string) => value,
    gray: (value: string) => value,
  },
}));

import { ConfigCommand } from '@/cli/commands/ConfigCommand';
import { ConfigValidator } from '@/cli/config/ConfigValidator';

type Command = ReturnType<typeof ConfigCommand.create> & {
  info: ReturnType<typeof vi.fn>;
};

describe('ConfigCommand uncovered branch coverage', () => {
  let command: Command;

  beforeEach(() => {
    command = ConfigCommand.create() as Command;
    command.info = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('formats every scalar type through formatConfigValue', () => {
    const cases: Array<[unknown, string]> = [
      [undefined, 'null'],
      [null, 'null'],
      [true, 'true'],
      [false, 'false'],
      [42, '42'],
      ['plain', 'plain'],
      [BigInt(7), '7'],
      [Symbol('tag'), 'Symbol(tag)'],
      [function named() {}, '[Function]'],
      [{ nested: 1 }, '{\n  "nested": 1\n}'],
    ];

    for (const [value, expected] of cases) {
      expect((command as any)['formatConfigValue'](value)).toBe(expected);
    }
  });

  it('renders unserializable validation errors through the toDisplayString fallback', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    vi.mocked(ConfigValidator.validate).mockReturnValueOnce({
      valid: false,
      errors: [circular] as never,
    });

    (command as any)['displayValidationStatus']({} as never);

    expect(command.info).toHaveBeenCalledWith('     - [Unserializable]');
  });

  it('renders validation errors of every message type via toDisplayString', () => {
    const values: unknown[] = [
      undefined,
      null,
      'plain message',
      13,
      BigInt(5),
      true,
      false,
      Symbol('issue'),
      () => undefined,
      { detail: 'object message' },
    ];

    for (const value of values) {
      vi.mocked(ConfigValidator.validate).mockReturnValueOnce({
        valid: false,
        errors: [{ message: value }] as never,
      });
      (command as any)['displayValidationStatus']({} as never);
    }

    const messages = command.info.mock.calls.map((call) => String(call[0]));
    expect(messages).toContain('     - null');
    expect(messages).toContain('     - plain message');
    expect(messages).toContain('     - 13');
    expect(messages).toContain('     - 5');
    expect(messages).toContain('     - true');
    expect(messages).toContain('     - false');
    expect(messages).toContain('     - Symbol(issue)');
    expect(messages).toContain('     - [Function]');
    expect(messages).toContain('     - {\n  "detail": "object message"\n}');
  });

  it('treats null errors as plain values when displaying validation status', () => {
    vi.mocked(ConfigValidator.validate).mockReturnValueOnce({
      valid: false,
      errors: [null] as never,
    });

    (command as any)['displayValidationStatus']({} as never);

    expect(command.info).toHaveBeenCalledWith('  ❌ Configuration has 1 errors:');
    expect(command.info).toHaveBeenCalledWith('     - null');
  });

  it('uses the valid-configuration early return and skips error rendering', () => {
    vi.mocked(ConfigValidator.validate).mockReturnValueOnce({ valid: true, errors: [] });

    (command as any)['displayValidationStatus']({} as never);

    expect(command.info).toHaveBeenCalledTimes(1);
    expect(command.info).toHaveBeenCalledWith('  ✅ Configuration is valid');
  });
});
