import { GcsDriver } from '@/tools/storage/drivers/Gcs';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('url returns undefined when bucket is blank', () => {
    expect(GcsDriver.url({ bucket: '   ' }, 'a/b.txt')).toBeUndefined();
  });

  it('url returns undefined when bucket is missing', () => {
    expect(GcsDriver.url({} as unknown as { bucket: string }, 'a/b.txt')).toBeUndefined();
  });

  it('url uses configured base url and trims trailing slash', () => {
    const url = GcsDriver.url({ bucket: 'b', url: 'https://cdn.example.com/' }, 'a/b.txt');
    expect(url).toBe('https://cdn.example.com/a/b.txt');
  });

  it('url encodes bucket and key path segments when no base url is provided', () => {
    const url = GcsDriver.url({ bucket: 'my bucket' }, 'a b/c+d.txt');
    expect(url).toBe('https://storage.googleapis.com/my%20bucket/a%20b/c%2Bd.txt');
  });

  it('throws a helpful error when @google-cloud/storage is not installed and no fake is injected', async () => {
    uninstallFake();

    await expect(GcsDriver.put({ bucket: 'b' }, 'k', Buffer.from('x'))).rejects.toThrow(
      /@google-cloud\/storage/
    );
  });

  it('put throws when bucket is missing', async () => {
    uninstallFake();

    await expect(
      GcsDriver.put({} as unknown as { bucket: string }, 'k', 'v')
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('get throws when bucket is missing', async () => {
    uninstallFake();

    await expect(GcsDriver.get({} as unknown as { bucket: string }, 'k')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('exists throws when bucket is missing', async () => {
    uninstallFake();

    await expect(GcsDriver.exists({} as unknown as { bucket: string }, 'k')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('delete throws when bucket is missing', async () => {
    uninstallFake();

    await expect(GcsDriver.delete({} as unknown as { bucket: string }, 'k')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('tempUrl throws when bucket is missing', async () => {
    uninstallFake();

    await expect(
      GcsDriver.tempUrl({} as unknown as { bucket: string }, 'k', { expiresIn: 60 })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('exists throws when bucket is blank', async () => {
    uninstallFake();

    await expect(GcsDriver.exists({ bucket: '   ' }, 'k')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('delete throws when bucket is blank', async () => {
    uninstallFake();

    await expect(GcsDriver.delete({ bucket: '   ' }, 'k')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('tempUrl throws when bucket is blank', async () => {
    uninstallFake();

    await expect(
      GcsDriver.tempUrl({ bucket: '   ' }, 'k', { expiresIn: 60 })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
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

  it('put returns an empty string when url becomes undefined after save()', async () => {
    uninstallFake();

    const config = { bucket: 'b' } as unknown as { bucket: string };

    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({
          async save() {
            (config as unknown as { bucket: string }).bucket = '   ';
          },
        }),
      }),
    };

    await expect(GcsDriver.put(config, 'k', 'v')).resolves.toBe('');
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

  it('put/get/exists/delete error branches are handled', async () => {
    await expect(GcsDriver.put({ bucket: '   ' }, 'k', 'v')).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );

    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({}),
      }),
    };

    await expect(GcsDriver.put({ bucket: 'b' }, 'k', 'v')).rejects.toHaveProperty(
      'message',
      'GCS: client is missing file.save()'
    );

    await expect(GcsDriver.get({ bucket: 'b' }, 'k')).rejects.toHaveProperty(
      'message',
      'GCS: client is missing file.download()'
    );

    // exists() should assume true when file.exists is not present
    await expect(GcsDriver.exists({ bucket: 'b' }, 'k')).resolves.toBe(true);

    // delete() should be a no-op when file.delete is not present
    await expect(GcsDriver.delete({ bucket: 'b' }, 'k')).resolves.toBeUndefined();
  });

  it('get normalizes string and Uint8Array download results into Buffer', async () => {
    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({
          async download() {
            return ['hello'];
          },
        }),
      }),
    };
    await expect(GcsDriver.get({ bucket: 'b' }, 'k')).resolves.toEqual(Buffer.from('hello'));

    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({
          async download() {
            return [Uint8Array.from([104, 105])]; // "hi"
          },
        }),
      }),
    };
    await expect(GcsDriver.get({ bucket: 'b' }, 'k')).resolves.toEqual(Buffer.from('hi'));
  });

  it('delete swallows delete() errors', async () => {
    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({
          async delete() {
            throw new Error('boom');
          },
        }),
      }),
    };

    await expect(GcsDriver.delete({ bucket: 'b' }, 'k')).resolves.toBeUndefined();
  });

  it('tempUrl validates expiresIn and handles missing getSignedUrl', async () => {
    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({}),
      }),
    };

    await expect(GcsDriver.tempUrl({ bucket: 'b' }, 'k', { expiresIn: 0 })).rejects.toHaveProperty(
      'code',
      'VALIDATION_ERROR'
    );
    await expect(
      GcsDriver.tempUrl({ bucket: 'b' }, 'k', { expiresIn: 604801 })
    ).rejects.toHaveProperty('code', 'VALIDATION_ERROR');

    await expect(GcsDriver.tempUrl({ bucket: 'b' }, 'k', { expiresIn: 60 })).rejects.toHaveProperty(
      'message',
      'GCS: client is missing file.getSignedUrl()'
    );
  });

  it('tempUrl uses action=write for PUT and computes expires correctly', async () => {
    const getSignedUrl = vi.fn(async () => ['https://signed.example/ok']);

    (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient = {
      bucket: () => ({
        file: () => ({
          getSignedUrl,
        }),
      }),
    };

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const url = await GcsDriver.tempUrl({ bucket: 'b' }, 'k', { expiresIn: 60, method: 'PUT' });
    nowSpy.mockRestore();

    expect(url).toBe('https://signed.example/ok');
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    expect(getSignedUrl.mock.calls[0]?.[0]).toMatchObject({
      version: 'v4',
      action: 'write',
      expires: 1_000_000 + 60_000,
    });
  });
});
