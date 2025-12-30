import { GcsDriver } from '@/tools/storage/drivers/Gcs';
import { afterEach, describe, expect, it } from 'vitest';

type FakeGcs = {
  bucket: (name: string) => {
    file: (key: string) => {
      save: (content: string | Buffer) => Promise<void>;
      download: () => Promise<[Buffer]>;
      exists: () => Promise<[boolean]>;
      delete: (_opts?: unknown) => Promise<void>;
      getSignedUrl: (opts: unknown) => Promise<[string]>;
    };
  };
};

const installFake = (): { fake: FakeGcs; store: Map<string, Buffer> } => {
  const store = new Map<string, Buffer>();

  const fake: FakeGcs = {
    bucket: (bucketName: string) => ({
      file: (key: string) => {
        const fullKey = `${bucketName}/${key}`;
        return {
          async save(content: string | Buffer) {
            store.set(
              fullKey,
              typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
            );
          },
          async download() {
            const v = store.get(fullKey);
            if (v === undefined) throw new Error('not found');
            return [Buffer.from(v)];
          },
          async exists() {
            return [store.has(fullKey)];
          },
          async delete() {
            store.delete(fullKey);
          },
          async getSignedUrl(opts: unknown) {
            const o = opts as { action?: string; expires?: number };
            return [
              `https://signed.example/${fullKey}?action=${encodeURIComponent(String(o.action ?? ''))}&expires=${encodeURIComponent(String(o.expires ?? ''))}`,
            ];
          },
        };
      },
    }),
  };

  (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = fake;
  return { fake, store };
};

const uninstallFake = (): void => {
  delete (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient;
};

describe('GcsDriver', () => {
  afterEach(() => {
    uninstallFake();
  });

  it('throws a helpful error when @google-cloud/storage is not installed and no fake is injected', async () => {
    uninstallFake();

    await expect(GcsDriver.put({ bucket: 'b' }, 'k', Buffer.from('x'))).rejects.toThrow(
      /@google-cloud\/storage/
    );
  });

  it('supports put/get/exists/delete via injected fake client', async () => {
    installFake();

    const config = { bucket: 'my-bucket' };

    expect(await GcsDriver.exists(config, 'a.txt')).toBe(false);
    await GcsDriver.put(config, 'a.txt', Buffer.from('hello'));
    expect(await GcsDriver.exists(config, 'a.txt')).toBe(true);

    const buf = await GcsDriver.get(config, 'a.txt');
    expect(buf.toString()).toBe('hello');

    await GcsDriver.delete(config, 'a.txt');
    expect(await GcsDriver.exists(config, 'a.txt')).toBe(false);
  });

  it('generates tempUrl via injected fake client', async () => {
    installFake();

    const url = await GcsDriver.tempUrl({ bucket: 'b' }, 'path/to/file.txt', {
      method: 'GET',
      expiresIn: 60,
    });

    expect(url).toContain('https://signed.example/');
    expect(url).toContain('action=read');
  });
});
