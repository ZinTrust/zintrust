import { fsPromises as fs } from '@node-singletons/fs';
import * as os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import { beforeEach, describe, expect, it } from 'vitest';

import { LocalDriver } from '@storage/drivers/Local';

describe('LocalDriver extra coverage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zintrust-local-extra-'));
  });

  it('put throws when root is missing/blank', async () => {
    await expect(LocalDriver.put({ root: '' }, 'k', 'v')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
    await expect(LocalDriver.put({ root: '   ' }, 'k', 'v')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('put supports Buffer content', async () => {
    const buf = Buffer.from('bin');
    const key = 'bin/data.bin';

    await LocalDriver.put({ root: tmpDir }, key, buf);
    const out = await LocalDriver.get({ root: tmpDir }, key);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString('utf8')).toBe('bin');
  });

  it('get throws NotFoundError when file is missing', async () => {
    await expect(LocalDriver.get({ root: tmpDir }, 'missing.txt')).rejects.toHaveProperty(
      'code',
      'NOT_FOUND'
    );
  });

  it('exists returns false when file does not exist; delete ignores missing file', async () => {
    const key = 'nope.txt';
    expect(await LocalDriver.exists({ root: tmpDir }, key)).toBe(false);
    await expect(LocalDriver.delete({ root: tmpDir }, key)).resolves.toBeUndefined();
  });

  it('url returns undefined when url missing, and trims trailing slash', () => {
    expect(LocalDriver.url({ root: tmpDir }, 'a.txt')).toBeUndefined();
    expect(LocalDriver.url({ root: tmpDir, url: '   ' }, 'a.txt')).toBeUndefined();
    expect(LocalDriver.url({ root: tmpDir, url: 'https://cdn.example.com/' }, 'a.txt')).toBe(
      'https://cdn.example.com/a.txt'
    );
  });
});
