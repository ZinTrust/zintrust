import { mkdtemp, rm } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { describe, expect, it } from 'vitest';

import { Manifest } from '@toolkit/Secrets/Manifest';

const writeFile = async (path: string, content: string): Promise<void> => {
  const { fsPromises } = await import('@node-singletons/fs');
  await fsPromises.writeFile(path, content, 'utf-8');
};

describe('Manifest coverage', () => {
  it('throws on invalid key name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-'));
    const filePath = join(dir, 'secrets.json');

    await writeFile(
      filePath,
      JSON.stringify({
        provider: 'aws',
        keys: {
          'invalid-key': { aws: { secretId: 'secret' } },
        },
      })
    );

    await expect(
      Manifest.load({ cwd: dir, path: 'secrets.json', provider: 'aws' })
    ).rejects.toThrow('Manifest: invalid env key');

    await rm(dir, { recursive: true, force: true });
  });
});
