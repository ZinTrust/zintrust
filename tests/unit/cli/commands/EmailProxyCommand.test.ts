import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  spawnAndWait: vi.fn(),
  withWranglerDevVarsSnapshot: vi.fn(),
  ensureLoaded: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  dirname: vi.fn((value: string) => value.split('/').slice(0, -1).join('/')),
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

vi.mock('@cli/cloudflare/CloudflareWranglerDevEnv', () => ({
  withWranglerDevVarsSnapshot: (...args: unknown[]) => mocked.withWranglerDevVarsSnapshot(...args),
}));

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: (...args: unknown[]) => mocked.ensureLoaded(...args),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => mocked.existsSync(...args),
  mkdirSync: (...args: unknown[]) => mocked.mkdirSync(...args),
  readFileSync: (...args: unknown[]) => mocked.readFileSync(...args),
  writeFileSync: (...args: unknown[]) => mocked.writeFileSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...args: string[]) => mocked.join(...args),
  dirname: (...args: [string]) => mocked.dirname(...args),
}));

vi.mock('@config/logger', () => ({
  Logger: mocked.logger,
}));

describe('EmailProxyCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocked.existsSync.mockImplementation((value: string) => value === '/repo/wrangler.jsonc');
    mocked.readFileSync.mockReturnValue('{\n  "name": "zintrust-api",\n  "env": {}\n}\n');
    mocked.spawnAndWait.mockResolvedValue(0);
    mocked.withWranglerDevVarsSnapshot.mockImplementation(
      async (_args: unknown, fn: () => Promise<unknown>) => fn()
    );
  });

  it('adds env.email-proxy when missing and starts wrangler dev', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { EmailProxyCommand } = await import('@cli/commands/EmailProxyCommand');
    await EmailProxyCommand.create().execute({});

    expect(mocked.mkdirSync).toHaveBeenCalledWith('/repo/src/proxy/email', { recursive: true });
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/src/proxy/email/ZintrustEmailProxy.ts',
      expect.stringContaining("from '@zintrust/core/proxy'"),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"email-proxy": {'),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"send_email": ['),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('email-proxy.example.com'),
      'utf-8'
    );
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'wrangler',
        args: ['dev', '--config', '/repo/.zin.proxy.email-proxy.jsonc', '--port', '5777'],
      })
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/.zin.proxy.email-proxy.jsonc',
      expect.stringContaining('"main": "./src/proxy/email/ZintrustEmailProxy.ts"'),
      'utf-8'
    );

    cwdSpy.mockRestore();
  });

  it('renders destination and allowlist options into wrangler config', async () => {
    mocked.existsSync.mockReturnValue(false);
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { EmailProxyCommand } = await import('@cli/commands/EmailProxyCommand');
    await EmailProxyCommand.create().execute({
      destinationAddress: 'alerts@example.com',
      allowedDestinationAddresses: 'ops@example.com, finance@example.com',
      allowedSenderAddresses: 'no-reply@example.com',
    });

    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"destination_address": "alerts@example.com"'),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining(
        '"allowed_destination_addresses": ["ops@example.com", "finance@example.com"]'
      ),
      'utf-8'
    );
    expect(mocked.writeFileSync).toHaveBeenCalledWith(
      '/repo/wrangler.jsonc',
      expect.stringContaining('"allowed_sender_addresses": ["no-reply@example.com"]'),
      'utf-8'
    );

    cwdSpy.mockRestore();
  });

  it('warns when the resolved project env does not provide a signing secret fallback', async () => {
    vi.stubEnv('APP_KEY', '');
    vi.stubEnv('MAIL_CLOUDFLARE_PROXY_SECRET', '');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { EmailProxyCommand } = await import('@cli/commands/EmailProxyCommand');
    await EmailProxyCommand.create().execute({});

    expect(mocked.logger.warn).toHaveBeenCalledWith(
      'Email proxy signing will fail: the resolved project env does not expose MAIL_CLOUDFLARE_PROXY_SECRET or APP_KEY to the Worker runtime. Signed requests will be rejected with 401 CONFIG_ERROR until one of those keys is set.'
    );

    cwdSpy.mockRestore();
  });

  it('passes a custom port through to wrangler dev', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

    const { EmailProxyCommand } = await import('@cli/commands/EmailProxyCommand');
    await EmailProxyCommand.create().execute({ port: '8787' });

    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'wrangler',
        args: ['dev', '--config', '/repo/.zin.proxy.email-proxy.jsonc', '--port', '8787'],
      })
    );

    cwdSpy.mockRestore();
  });
});
