import { fsPromises as fs } from '@node-singletons/fs';
import * as os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import { beforeEach, describe, expect, it } from 'vitest';

import { LocalDriver } from '@storage/drivers/Local';

describe('LocalDriver', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zintrust-test-'));
    process.env['APP_KEY'] = 'test-app-key';
  });

  it('puts, gets, checks existence and deletes a file', async () => {
    const key = 'sub/hello.txt';
    const content = 'Hello World';

    const full = await LocalDriver.put({ root: tmpDir }, key, content);
    expect(full).toContain(tmpDir);

    const exists = await LocalDriver.exists({ root: tmpDir }, key);
    expect(exists).toBe(true);

    const data = await LocalDriver.get({ root: tmpDir }, key);
    expect(data.toString('utf8')).toBe(content);

    await LocalDriver.delete({ root: tmpDir }, key);
    const exists2 = await LocalDriver.exists({ root: tmpDir }, key);
    expect(exists2).toBe(false);
  });

  it('tempUrl returns url when configured', () => {
    const url = LocalDriver.tempUrl({ root: '/tmp', url: '/storage' }, 'a/b.txt', {
      expiresIn: 60,
      method: 'GET',
    });
    expect(url.startsWith('/storage/download?token=')).toBe(true);
  });

  it('tempUrl throws when url is missing', () => {
    expect(() => LocalDriver.tempUrl({ root: '/tmp' }, 'a.txt')).toThrow();
  });
});
