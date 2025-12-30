import { GcsDriver } from '@/tools/storage/drivers/Gcs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('GcsDriver extra tests', () => {
  beforeEach(() => {
    // reset any injected fake client
    // @ts-ignore
    delete globalThis.__fakeGcsClient;
  });
  afterEach(() => {
    // cleanup
    // @ts-ignore
    delete globalThis.__fakeGcsClient;
  });

  it('builds URL correctly and returns undefined for empty bucket', () => {
    expect(GcsDriver.url({ bucket: '' }, 'key')).toBeUndefined();
    expect(GcsDriver.url({ bucket: 'my-bucket', url: 'https://cdn.example.com' }, 'a/b')).toBe(
      'https://cdn.example.com/a/b'
    );
    expect(GcsDriver.url({ bucket: 'my bucket' }, 'a b/c')).toContain(
      'https://storage.googleapis.com/'
    );
  });

  it('put/get/exists/delete/tempUrl with fake client', async () => {
    // inject fake client
    // Our fake emulates the minimal needed methods
    // @ts-ignore
    globalThis.__fakeGcsClient = {
      bucket: (_name: string) => ({
        file: (_key: string) => ({
          save: async (_content: string | Buffer) => Promise.resolve(),
          download: async () => [Buffer.from('hello')],
          exists: async () => [true],
          delete: async () => Promise.resolve(),
          getSignedUrl: async () => ['https://signed.example.com'],
        }),
      }),
    };

    const config = { bucket: 'my-bucket' };
    const url = await GcsDriver.put(config, 'path/file.txt', 'content');
    expect(url).toContain('https://');

    const data = await GcsDriver.get(config, 'path/file.txt');
    expect(data.toString()).toBe('hello');

    const exists = await GcsDriver.exists(config, 'path/file.txt');
    expect(exists).toBe(true);

    // delete should not throw
    await GcsDriver.delete(config, 'path/file.txt');

    // tempUrl: invalid expires
    await expect(GcsDriver.tempUrl(config, 'k', { expiresIn: -1 })).rejects.toThrow();
    await expect(GcsDriver.tempUrl(config, 'k', { expiresIn: 604801 })).rejects.toThrow();

    const signed = await GcsDriver.tempUrl(config, 'k');
    expect(signed).toBe('https://signed.example.com');
  });
});
