import { describe, expect, it, vi } from 'vitest';

const remoteRequest = vi.fn();

let jwtDecodeImpl: ((token: string) => unknown) | null = null;
let useDatabaseImpl: (() => unknown) | null = null;
let loggerDebugImpl: ((msg: string, meta?: unknown) => void) | null = null;

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    create: () => ({
      decode: (token: string) => (jwtDecodeImpl ? jwtDecodeImpl(token) : {}),
    }),
  },
}));

vi.mock('@orm/Database', () => ({
  useDatabase: () => (useDatabaseImpl ? useDatabaseImpl() : {}),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: (msg: string, meta?: unknown) => {
      if (loggerDebugImpl) loggerDebugImpl(msg, meta);
    },
  },
}));

vi.mock('@common/RemoteSignedJson', () => ({
  RemoteSignedJson: {
    request: remoteRequest,
  },
  default: {
    request: remoteRequest,
  },
}));

describe('patch coverage: TokenRevocation signing prefix + memory/db cleanup branches', () => {
  it('covers resolveSigningPrefix try-path (non-root prefix)', async () => {
    vi.resetModules();
    remoteRequest.mockReset();
    remoteRequest.mockImplementation(async () => ({ value: '1' }));

    const prevEnv = { ...process.env };
    process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
    process.env['KV_REMOTE_KEY_ID'] = 'kid';
    process.env['KV_REMOTE_SECRET'] = 'secret';
    process.env['KV_REMOTE_URL'] = 'https://proxy.example.test/api/';
    process.env['KV_ACCOUNT_ID'] = '';
    process.env['KV_API_TOKEN'] = '';
    process.env['KV_NAMESPACE'] = '';

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.isRevoked('t')).resolves.toBe(true);

    const settings = remoteRequest.mock.calls[0]?.[0] as { signaturePathPrefixToStrip?: string };
    expect(settings.signaturePathPrefixToStrip).toBe('/api');

    process.env = prevEnv;
  });

  it('covers resolveSigningPrefix catch-path (invalid URL -> undefined)', async () => {
    vi.resetModules();
    remoteRequest.mockReset();
    remoteRequest.mockImplementation(async () => ({ value: '1' }));

    const prevEnv = { ...process.env };
    process.env['JWT_REVOCATION_DRIVER'] = 'kv-remote';
    process.env['KV_REMOTE_KEY_ID'] = 'kid';
    process.env['KV_REMOTE_SECRET'] = 'secret';
    process.env['KV_REMOTE_URL'] = 'http://[::1';
    process.env['KV_ACCOUNT_ID'] = '';
    process.env['KV_API_TOKEN'] = '';
    process.env['KV_NAMESPACE'] = '';

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.isRevoked('t')).resolves.toBe(true);

    const settings = remoteRequest.mock.calls[0]?.[0] as { signaturePathPrefixToStrip?: string };
    expect(settings.signaturePathPrefixToStrip).toBeUndefined();

    process.env = prevEnv;
  });

  it('covers memory store expired delete branch', async () => {
    vi.resetModules();

    const prevDriver = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'memory';

    jwtDecodeImpl = () => ({ exp: Math.floor(Date.now() / 1000) - 10, jti: 'jti' });

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    await expect(TokenRevocation.revoke('Bearer t')).resolves.toBe('t');
    await expect(TokenRevocation.isRevoked('t')).resolves.toBe(false);

    if (prevDriver === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
    else process.env['JWT_REVOCATION_DRIVER'] = prevDriver;

    jwtDecodeImpl = null;
  });

  it('covers database cleanup failure debug branch and non-expired return true', async () => {
    vi.resetModules();

    const debug = vi.fn();
    loggerDebugImpl = debug;

    const db = {
      table: () => ({
        where: (field: string) => ({
          async delete() {
            if (field === 'expires_at_ms') throw new Error('cleanup-fail');
            return 1;
          },
          async first() {
            return { jti: 'id', expires_at_ms: Date.now() + 60_000 };
          },
        }),
      }),
    };

    useDatabaseImpl = () => db;

    const prevDriver = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'database';

    const { TokenRevocation } = await import('../../../src/index');
    TokenRevocation._resetForTests();

    // call enough times to trigger maybeCleanup (250th)
    for (let i = 0; i < 249; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await TokenRevocation.isRevoked('x');
    }

    await expect(TokenRevocation.isRevoked('x')).resolves.toBe(true);
    expect(debug).toHaveBeenCalled();

    if (prevDriver === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
    else process.env['JWT_REVOCATION_DRIVER'] = prevDriver;

    useDatabaseImpl = null;
    loggerDebugImpl = null;
  });
});
