import { fsPromises as fs } from '@node-singletons/fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { LocalDriver } from '@storage/drivers/Local';

describe('LocalDriver', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zintrust-test-'));
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
});
