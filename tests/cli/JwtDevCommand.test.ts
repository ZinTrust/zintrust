import { JwtManager } from '@/security/JwtManager';
import { describe, expect, it, vi } from 'vitest';

type ExitFn = typeof process.exit;

const findJwtLikeLine = (lines: string[]): string => {
  const jwtRegex = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const found = lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .find((l) => jwtRegex.test(l));

  expect(found).toBeDefined();
  return found as string;
};

describe('CLI JwtDevCommand', () => {
  it('prints a verifiable JWT', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['JWT_SECRET'] = 'test-jwt-secret';
    process.env['JWT_ALGORITHM'] = 'HS256';

    vi.resetModules();
    const { CLI } = await import('@/cli/CLI');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const cli = CLI.create();
    await cli.run(['jwt:dev', '--sub', '1', '--email', 'dev@example.com', '--role', 'admin']);

    const outputLines = logSpy.mock.calls.map((c) => String(c[0] ?? ''));
    const token = findJwtLikeLine(outputLines);

    const jwt = JwtManager.create();
    jwt.setHmacSecret('test-jwt-secret');

    const payload = jwt.verify(token, 'HS256');
    expect(payload.sub).toBe('1');
    expect(payload['email']).toBe('dev@example.com');
    expect(payload['role']).toBe('admin');

    logSpy.mockRestore();
  });

  it('prints JSON when --json is used', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['JWT_SECRET'] = 'test-jwt-secret';
    process.env['JWT_ALGORITHM'] = 'HS256';

    vi.resetModules();
    const { CLI } = await import('@/cli/CLI');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const cli = CLI.create();
    await cli.run(['jwt:dev', '--json', '--sub', '1', '--expires', '60']);

    const outputLines = logSpy.mock.calls.map((c) => String(c[0] ?? '')).filter(Boolean);
    const jsonLine = outputLines.find((l) => l.trim().startsWith('{') && l.trim().endsWith('}'));

    expect(jsonLine).toBeDefined();

    const parsed = JSON.parse(String(jsonLine)) as {
      token: string;
      expiresIn: number;
      issuedAt: number;
      expiresAt: number;
    };
    expect(typeof parsed.token).toBe('string');
    expect(parsed.expiresIn).toBe(60);
    expect(parsed.expiresAt - parsed.issuedAt).toBe(60);

    const jwt = JwtManager.create();
    jwt.setHmacSecret('test-jwt-secret');
    expect(jwt.verify(parsed.token, 'HS256').sub).toBe('1');

    logSpy.mockRestore();
  });

  it('refuses to run when JWT algorithm is unsupported', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['JWT_SECRET'] = 'test-jwt-secret';
    process.env['JWT_ALGORITHM'] = 'RS256';

    vi.resetModules();
    const { CLI } = await import('@/cli/CLI');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${String(code ?? '')}`);
    }) as ExitFn);

    const cli = CLI.create();
    await expect(cli.run(['jwt:dev'])).rejects.toThrow(/process\.exit:1|process\.exit:2/);

    exitSpy.mockRestore();
  });

  it('refuses to run in production unless --allow-production is set', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['JWT_SECRET'] = 'test-jwt-secret';
    process.env['JWT_ALGORITHM'] = 'HS256';

    vi.resetModules();
    const { CLI } = await import('@/cli/CLI');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${String(code ?? '')}`);
    }) as ExitFn);

    const cli = CLI.create();

    await expect(cli.run(['jwt:dev'])).rejects.toThrow(/process\.exit:1|process\.exit:2/);

    exitSpy.mockRestore();
  });
});
