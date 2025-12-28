import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecretsCommand } from '@cli/commands/SecretsCommand';

// Avoid noisy output
vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    handle: vi.fn(),
  },
}));

describe('SecretsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create the command', () => {
    const cmd = SecretsCommand.create();
    expect(cmd.name).toBe('secrets');
    expect(cmd.getCommand().name()).toBe('secrets');
  });
});
