import { PluginAutoImports } from '@runtime/PluginAutoImports';
import { TokenRevocation } from '@security/TokenRevocation';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const b64url = (input: string): string =>
  Buffer.from(input, 'utf-8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const makeJwtWithExp = (expSeconds: number): string => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ exp: expSeconds }));
  // Signature is not validated by decode(); only structure matters.
  return `${header}.${payload}.sig`;
};

describe('patch coverage: PluginAutoImports', () => {
  const prevRoot = process.env['ZINTRUST_PROJECT_ROOT'];

  afterEach(() => {
    if (prevRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = prevRoot;
  });

  it('returns not-found when no candidate exists', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-plugin-imports-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = temp;

    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('not-found');
  });

  it('imports a dist auto-imports JS file when present', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-plugin-imports-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = temp;

    const distDir = path.join(temp, 'dist', 'src');
    fs.mkdirSync(distDir, { recursive: true });

    const pluginFile = path.join(distDir, 'zintrust.plugins.js');
    fs.writeFileSync(pluginFile, 'export {};\n', 'utf-8');

    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(true);
    if (result.ok === true) expect(result.loadedPath).toBe(pluginFile);
  });

  it('returns import-failed when candidate exists but throws on import', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-plugin-imports-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = temp;

    const distDir = path.join(temp, 'dist', 'src');
    fs.mkdirSync(distDir, { recursive: true });

    const pluginFile = path.join(distDir, 'zintrust.plugins.js');
    fs.writeFileSync(pluginFile, 'throw new Error("boom");\n', 'utf-8');

    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe('import-failed');
      expect(result.loadedPath).toBe(pluginFile);
      expect(result.errorMessage).toContain('boom');
    }
  });
});

describe('patch coverage: TokenRevocation', () => {
  const prevDriver = process.env['JWT_REVOCATION_DRIVER'];

  afterEach(() => {
    if (prevDriver === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
    else process.env['JWT_REVOCATION_DRIVER'] = prevDriver;
  });

  it('revoke() returns null for non-bearer headers', async () => {
    process.env['JWT_REVOCATION_DRIVER'] = 'memory';
    TokenRevocation._resetForTests();
    expect(await TokenRevocation.revoke(undefined)).toBeNull();
    expect(await TokenRevocation.revoke('')).toBeNull();
    expect(await TokenRevocation.revoke('Basic abc')).toBeNull();
    expect(await TokenRevocation.revoke(['Bearer'])).toBeNull();
    expect(await TokenRevocation.revoke('Bearer   ')).toBeNull();
  });

  it('revokes tokens and expires them based on exp when present', async () => {
    process.env['JWT_REVOCATION_DRIVER'] = 'memory';
    TokenRevocation._resetForTests();
    const nowSeconds = Math.floor(Date.now() / 1000);

    const expired = makeJwtWithExp(nowSeconds - 10);
    const active = makeJwtWithExp(nowSeconds + 10_000);

    const revokedExpired = await TokenRevocation.revoke(`Bearer ${expired}`);
    expect(revokedExpired).toBe(expired);

    // Already expired: should not be considered revoked.
    expect(await TokenRevocation.isRevoked(expired)).toBe(false);

    const revokedActive = await TokenRevocation.revoke(`Bearer ${active}`);
    expect(revokedActive).toBe(active);
    expect(await TokenRevocation.isRevoked(active)).toBe(true);
  });

  it('falls back to default TTL when token cannot be decoded', async () => {
    process.env['JWT_REVOCATION_DRIVER'] = 'memory';
    TokenRevocation._resetForTests();
    const token = 'not-a-jwt';
    const revoked = await TokenRevocation.revoke(`Bearer ${token}`);
    expect(revoked).toBe(token);
    expect(await TokenRevocation.isRevoked(token)).toBe(true);
  });
});
