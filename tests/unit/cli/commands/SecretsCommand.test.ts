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

vi.mock('@toolkit/Secrets', () => ({
  SecretsToolkit: {
    pull: vi.fn(),
    push: vi.fn(),
    doctor: vi.fn(),
  },
}));

import { ErrorHandler } from '@cli/ErrorHandler';
import { SecretsToolkit } from '@toolkit/Secrets';

describe('SecretsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create the command', () => {
    const cmd = SecretsCommand.create();
    expect(cmd.name).toBe('secrets');
    expect(cmd.getCommand().name()).toBe('secrets');
  });

  it('executes pull and prints success', async () => {
    // @ts-ignore
    vi.mocked(SecretsToolkit.pull).mockResolvedValue({ outFile: '.env.pull', keys: ['A', 'B'] });

    const cmd = SecretsCommand.create();
    await cmd.execute({ args: ['pull'], provider: 'aws' });

    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalled();
  });

  it('executes push and prints success', async () => {
    // @ts-ignore
    vi.mocked(SecretsToolkit.push).mockResolvedValue({ inFile: '.env', keys: ['X'] });

    const cmd = SecretsCommand.create();
    await cmd.execute({ args: ['push'], provider: 'cloudflare' });

    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalled();
  });

  it('executes doctor and prints warn on failure', async () => {
    // @ts-ignore
    vi.mocked(SecretsToolkit.doctor).mockReturnValue({
      provider: 'aws',
      ok: false,
      missing: ['AWS_REGION'],
    });

    const cmd = SecretsCommand.create();
    await cmd.execute({ args: ['doctor'], provider: 'aws' });

    expect(vi.mocked(ErrorHandler.warn)).toHaveBeenCalled();
  });

  it('throws on unknown action', async () => {
    const cmd = SecretsCommand.create();
    await expect(cmd.execute({ args: ['unknown'] as unknown as string[] })).rejects.toBeDefined();
  });
});
