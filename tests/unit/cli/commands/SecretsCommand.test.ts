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

  it('defaults to pull when args is missing or not an array, and passes through paths + dryRun', async () => {
    // @ts-ignore
    vi.mocked(SecretsToolkit.pull).mockResolvedValue({ outFile: '.env.pull', keys: [] });

    const cmd = SecretsCommand.create();

    await cmd.execute({
      // args intentionally omitted to cover default action branch
      provider: 'not-a-provider',
      manifest: 'm.json',
      out: '.out',
      dryRun: true,
    } as any);

    expect(vi.mocked(SecretsToolkit.pull)).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: undefined,
        manifestPath: 'm.json',
        outFile: '.out',
        dryRun: true,
      })
    );
    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalledWith(
      expect.stringContaining('(dry-run)')
    );

    vi.mocked(SecretsToolkit.pull).mockClear();
    await cmd.execute({ args: 'pull' } as any);
    expect(vi.mocked(SecretsToolkit.pull)).toHaveBeenCalled();
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

  it('executes doctor and prints success on ok', async () => {
    // @ts-ignore
    vi.mocked(SecretsToolkit.doctor).mockReturnValue({
      provider: 'cloudflare',
      ok: true,
      missing: [],
    });

    const cmd = SecretsCommand.create();
    await cmd.execute({ args: ['doctor'], provider: 'cloudflare' });
    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalledWith(
      expect.stringContaining('Secrets doctor OK')
    );
  });

  it('passes inFile to push when provided', async () => {
    // @ts-ignore
    vi.mocked(SecretsToolkit.push).mockResolvedValue({ inFile: '.env.custom', keys: ['X'] });

    const cmd = SecretsCommand.create();
    await cmd.execute({ args: ['push'], provider: 'aws', in: '.env.custom', dryRun: true } as any);

    expect(vi.mocked(SecretsToolkit.push)).toHaveBeenCalledWith(
      expect.objectContaining({ inFile: '.env.custom', dryRun: true })
    );
  });

  it('throws on unknown action', async () => {
    const cmd = SecretsCommand.create();
    await expect(cmd.execute({ args: ['unknown'] as unknown as string[] })).rejects.toBeDefined();
  });
});
