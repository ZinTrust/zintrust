import { afterEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@config/logger';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ResourceControlCommand', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('rejects invalid actions', async () => {
    const { ResourceControlCommand } = await import('@cli/commands/ResourceControlCommand');

    await ResourceControlCommand.execute({ args: [] });

    expect(Logger.error).toHaveBeenCalledWith('Invalid action. Use "start" or "stop".');
  });

  it('sends a start request and logs success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ message: 'ok' }),
      }))
    );

    const { ResourceControlCommand } = await import('@cli/commands/ResourceControlCommand');

    await ResourceControlCommand.execute({ args: ['start'], port: '7777', host: '127.0.0.1' });

    expect(Logger.info).toHaveBeenCalledWith('Success: ok');
  });

  it('logs errors when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'fail',
      }))
    );

    const { ResourceControlCommand } = await import('@cli/commands/ResourceControlCommand');

    await ResourceControlCommand.execute({ args: ['stop'], port: '7777', host: '127.0.0.1' });

    expect(Logger.error).toHaveBeenCalledWith('Failed to stop resource monitor: HTTP 500: fail');
    expect(Logger.info).toHaveBeenCalledWith(
      'Ensure the worker service is running and the port is correct.'
    );
  });
});
