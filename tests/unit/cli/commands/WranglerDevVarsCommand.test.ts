import { materializeWranglerDevVars } from '@cli/cloudflare/CloudflareWranglerDevEnv';
import { WranglerDevVarsCommand } from '@cli/commands/WranglerDevVarsCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/cloudflare/CloudflareWranglerDevEnv', () => ({
  materializeWranglerDevVars: vi.fn(),
}));

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    handle: vi.fn(),
  },
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitCommand: vi.fn(),
  },
}));

describe('WranglerDevVarsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('materializes Wrangler dev vars from command options', async () => {
    vi.mocked(materializeWranglerDevVars).mockResolvedValue({
      filePath: '/workspace/.dev.vars.production',
      selectedKeys: ['APP_KEY', 'JWT_SECRET'],
      missingKeys: ['SESSION_SECRET'],
      values: { APP_KEY: 'app-key', JWT_SECRET: 'jwt-secret' },
    });

    const command = WranglerDevVarsCommand.create().getCommand();
    command.exitOverride();

    await command.parseAsync([
      'node',
      'test',
      '--env',
      'production',
      '--env-path',
      '.env.worker',
      '--target',
      'api',
      '--config',
      'wrangler.test.jsonc',
    ]);

    expect(materializeWranglerDevVars).toHaveBeenCalledWith({
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      envName: 'production',
      envPath: '.env.worker',
      target: 'api',
      configPath: 'wrangler.test.jsonc',
      requireSelection: true,
    });
    expect(ErrorHandler.success).toHaveBeenCalledWith(
      'Wrangler dev vars prepared at /workspace/.dev.vars.production'
    );
    expect(ErrorHandler.info).toHaveBeenCalledWith('Selected keys: 2');
    expect(ErrorHandler.warn).toHaveBeenCalledWith('Missing keys: SESSION_SECRET');
  });
});
