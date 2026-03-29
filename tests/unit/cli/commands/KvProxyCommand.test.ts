import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  spawnAndWait: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: (...args: unknown[]) => mocked.spawnAndWait(...args),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => mocked.existsSync(...args),
  readFileSync: (...args: unknown[]) => mocked.readFileSync(...args),
  writeFileSync: (...args: unknown[]) => mocked.writeFileSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...args: string[]) => mocked.join(...args),
}));

vi.mock('@config/logger', () => ({
  Logger: mocked.logger,
}));

describe('KvProxyCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocked.existsSync.mockReturnValue(true);
    mocked.readFileSync.mockReturnValue('{\n  "name": "zintrust-api",\n  "env": {}\n}\n');
    mocked.spawnAndWait.mockResolvedValue(0);
  });

  it('adds env.kv-proxy when missing and starts wrangler dev', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { KvProxyCommand } = await import('@cli/commands/KvProxyCommand');
    await KvProxyCommand.create().execute({});

    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"kv-proxy": {'),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"KV_NAMESPACE": "ZIN_KV"'),
      'utf-8'
    );
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'wrangler',
        args: ['dev', '--config', '/repo/wrangler.jsonc', '--env', 'kv-proxy'],
      })
    );

    cwdSpy.mockRestore();
  });

  it('creates wrangler.jsonc when missing', async () => {
    mocked.existsSync.mockReturnValue(false);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { KvProxyCommand } = await import('@cli/commands/KvProxyCommand');
    await KvProxyCommand.create().execute({ namespaceId: 'kv123', previewId: 'preview123' });

    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"id": "kv123"'),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"preview_id": "preview123"'),
      'utf-8'
    );
    expect(mocked.logger.info).toHaveBeenCalledWith(
      'Created /repo/wrangler.jsonc with a default kv-proxy environment.'
    );

    cwdSpy.mockRestore();
  });
});
