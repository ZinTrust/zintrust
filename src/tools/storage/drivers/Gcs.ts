import { ErrorFactory } from '@exceptions/ZintrustError';

export type GcsConfig = {
  bucket: string;
  projectId?: string;
  keyFile?: string;
  url?: string;
};

type TempUrlOptions = { expiresIn?: number; method?: 'GET' | 'PUT' };

type GcsClientLike = {
  bucket: (name: string) => {
    file: (key: string) => {
      save?: (content: string | Buffer) => Promise<unknown>;
      download?: () => Promise<[Uint8Array | Buffer | string]>;
      exists?: () => Promise<[boolean]>;
      delete?: (options?: unknown) => Promise<unknown>;
      getSignedUrl?: (options: unknown) => Promise<[string]>;
    };
  };
};

let cachedRealClient: GcsClientLike | undefined;

const getInjectedFakeClient = (): GcsClientLike | undefined => {
  const v = (globalThis as unknown as { __fakeGcsClient?: unknown }).__fakeGcsClient;
  return v as GcsClientLike | undefined;
};

const loadRealClient = async (config: GcsConfig): Promise<GcsClientLike> => {
  if (cachedRealClient !== undefined) return cachedRealClient;

  try {
    // Avoid a string-literal import so TypeScript doesn't require the module at build time.
    const specifier = '@google-cloud/storage';
    const mod = (await import(specifier)) as unknown as {
      Storage?: new (opts?: Record<string, unknown>) => GcsClientLike;
    };

    if (typeof mod.Storage !== 'function') {
      throw ErrorFactory.createConfigError('GCS: @google-cloud/storage did not export Storage');
    }

    const opts: Record<string, unknown> = {};
    if (typeof config.projectId === 'string' && config.projectId.trim() !== '') {
      opts['projectId'] = config.projectId;
    }
    if (typeof config.keyFile === 'string' && config.keyFile.trim() !== '') {
      opts['keyFilename'] = config.keyFile;
    }

    cachedRealClient = new mod.Storage(opts);
    return cachedRealClient;
  } catch (err: unknown) {
    throw ErrorFactory.createConfigError(
      'GCS: missing optional dependency @google-cloud/storage (install it or inject globalThis.__fakeGcsClient for tests)',
      { error: err }
    );
  }
};

const getClient = async (config: GcsConfig): Promise<GcsClientLike> => {
  const injected = getInjectedFakeClient();
  if (injected !== undefined) return injected;
  return loadRealClient(config);
};

const encodePathSegments = (key: string): string =>
  key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

export const GcsDriver = Object.freeze({
  url(config: GcsConfig, key: string): string | undefined {
    const bucket = String(config.bucket ?? '').trim();
    if (bucket === '') return undefined;

    const base = typeof config.url === 'string' ? config.url.trim() : '';
    if (base !== '') return `${base.replace(/\/$/, '')}/${key}`;

    const encodedKey = encodePathSegments(key);
    return `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${encodedKey}`;
  },

  async put(config: GcsConfig, key: string, content: string | Buffer): Promise<string> {
    const bucket = String(config.bucket ?? '').trim();
    if (bucket === '') throw ErrorFactory.createConfigError('GCS: bucket is not configured');

    const client = await getClient(config);
    const file = client.bucket(bucket).file(key);

    if (typeof file.save !== 'function') {
      throw ErrorFactory.createConfigError('GCS: client is missing file.save()');
    }

    await file.save(content);

    const url = GcsDriver.url(config, key);
    if (url === undefined) return '';
    return url;
  },

  async get(config: GcsConfig, key: string): Promise<Buffer> {
    const bucket = String(config.bucket ?? '').trim();
    if (bucket === '') throw ErrorFactory.createConfigError('GCS: bucket is not configured');

    const client = await getClient(config);
    const file = client.bucket(bucket).file(key);

    if (typeof file.download !== 'function') {
      throw ErrorFactory.createConfigError('GCS: client is missing file.download()');
    }

    const [data] = await file.download();
    if (Buffer.isBuffer(data)) return data;
    if (typeof data === 'string') return Buffer.from(data);
    return Buffer.from(data);
  },

  async exists(config: GcsConfig, key: string): Promise<boolean> {
    const bucket = String(config.bucket ?? '').trim();
    if (bucket === '') throw ErrorFactory.createConfigError('GCS: bucket is not configured');

    const client = await getClient(config);
    const file = client.bucket(bucket).file(key);

    if (typeof file.exists !== 'function') {
      // if client doesn't support exists, assume true (matches Storage.exists default behavior)
      return true;
    }

    const [exists] = await file.exists();
    return Boolean(exists);
  },

  async delete(config: GcsConfig, key: string): Promise<void> {
    const bucket = String(config.bucket ?? '').trim();
    if (bucket === '') throw ErrorFactory.createConfigError('GCS: bucket is not configured');

    const client = await getClient(config);
    const file = client.bucket(bucket).file(key);

    if (typeof file.delete !== 'function') return;

    try {
      // google-cloud-storage supports ignoreNotFound, but keep it flexible for fakes
      await file.delete({ ignoreNotFound: true });
    } catch (err: unknown) {
      void err;
    }
  },

  async tempUrl(config: GcsConfig, key: string, options?: TempUrlOptions): Promise<string> {
    const bucket = String(config.bucket ?? '').trim();
    if (bucket === '') throw ErrorFactory.createConfigError('GCS: bucket is not configured');

    const expiresIn = options?.expiresIn ?? 900;
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw ErrorFactory.createValidationError('GCS: expiresIn must be a positive number', {
        expiresIn,
      });
    }
    if (expiresIn > 604800) {
      throw ErrorFactory.createValidationError('GCS: expiresIn exceeds 7 days', {
        expiresIn,
      });
    }

    const method = options?.method ?? 'GET';
    const action = method === 'PUT' ? 'write' : 'read';

    const client = await getClient(config);
    const file = client.bucket(bucket).file(key);

    if (typeof file.getSignedUrl !== 'function') {
      throw ErrorFactory.createConfigError('GCS: client is missing file.getSignedUrl()');
    }

    const expires = Date.now() + expiresIn * 1000;
    const [url] = await file.getSignedUrl({ version: 'v4', action, expires });
    return url;
  },
});

export default GcsDriver;
