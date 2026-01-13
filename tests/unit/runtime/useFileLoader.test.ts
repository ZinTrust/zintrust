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
});
