import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useFileLoader } from '../../../src/index';

describe('useFileLoader', () => {
  const prevRoot = process.env['ZINTRUST_PROJECT_ROOT'];
  let tempRoot: string | undefined;

  afterEach(() => {
    if (prevRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = prevRoot;

    if (tempRoot !== undefined) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('loads default export via .js fallback when requesting a .ts path', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    const configDir = path.join(tempRoot, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const mailMjs = path.join(configDir, 'mail.mjs');
    fs.writeFileSync(mailMjs, "export default { driver: 'smtp' }\n", 'utf-8');

    const config = await useFileLoader('config/mail.ts').get<{ driver: string }>();
    expect(config.driver).toBe('smtp');

    expect(useFileLoader('config/mail.ts').path()).toBe(mailMjs);
  });

  it('returns the full module namespace object when no default export exists', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    const configDir = path.join(tempRoot, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const file = path.join(configDir, 'named.mjs');
    fs.writeFileSync(file, 'export const answer = 42;\n', 'utf-8');

    const mod = await useFileLoader('config', 'named.mjs').get<{ answer: number }>();
    expect(mod.answer).toBe(42);
  });

  it('throws a NOT_FOUND error when no candidate exists', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    await expect(useFileLoader('config/missing.ts').get()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('rejects path traversal attempts', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    try {
      useFileLoader('../secrets.env');
      throw new Error('Expected useFileLoader() to throw');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'SECURITY_ERROR' });
    }
  });

  it('rejects absolute paths', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    try {
      useFileLoader('/etc/passwd');
      throw new Error('Expected useFileLoader() to throw');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'SECURITY_ERROR' });
    }
  });

  it('rejects empty or whitespace-only paths', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    try {
      useFileLoader('   ');
      throw new Error('Expected useFileLoader() to throw');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'CONFIG_ERROR' });
    }
  });

  it('rejects paths containing null bytes', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    try {
      useFileLoader('config/bad\u0000path.mjs');
      throw new Error('Expected useFileLoader() to throw');
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'SECURITY_ERROR' });
    }
  });

  it('exposes deterministic candidate resolution and path() fallback', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    const loader = useFileLoader('config/foo');
    const candidates = loader.candidates();

    expect(candidates).toContain(path.resolve(tempRoot, 'config/foo.ts'));
    expect(candidates).toContain(path.resolve(tempRoot, 'config/foo.js'));
    expect(candidates).toContain(path.resolve(tempRoot, 'config/foo.mjs'));

    // When nothing exists on disk, we still resolve to the first candidate.
    expect(loader.path()).toBe(candidates[0]);
    expect(loader.exists()).toBe(false);
  });

  it('wraps ESM import failures with TRY_CATCH_ERROR', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-file-loader-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tempRoot;

    const configDir = path.join(tempRoot, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    const bad = path.join(configDir, 'throws.mjs');
    fs.writeFileSync(bad, "throw new Error('boom')\n", 'utf-8');

    await expect(useFileLoader('config/throws.mjs').get()).rejects.toMatchObject({
      code: 'TRY_CATCH_ERROR',
    });
  });

  it('treats core repo as internal root in test runtime even when npm_package_name is unset', async () => {
    const prevProjectRoot = process.env['ZINTRUST_PROJECT_ROOT'];
    const prevNpmPackageName = process.env['npm_package_name'];

    try {
      delete process.env['ZINTRUST_PROJECT_ROOT'];
      delete process.env['npm_package_name'];

      // In a core-repo checkout, the loader should detect the repo via import.meta.url
      // and avoid auto-loading template config files during tests.
      const loader = useFileLoader('config/middleware.ts');
      expect(loader.exists()).toBe(false);
      await expect(loader.get()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      if (prevProjectRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
      else process.env['ZINTRUST_PROJECT_ROOT'] = prevProjectRoot;

      if (prevNpmPackageName === undefined) delete process.env['npm_package_name'];
      else process.env['npm_package_name'] = prevNpmPackageName;
    }
  });
});
