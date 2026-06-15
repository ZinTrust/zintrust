import { Cloudflare } from '@config/cloudflare';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { S3Driver, type S3Config } from '@storage/drivers/S3';

export type R2Config = {
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Cloudflare R2 endpoint (e.g., https://<accountid>.r2.cloudflarestorage.com)
  url?: string; // Public base URL / custom domain mapped to the bucket root (e.g., https://r2.example.app)
  binding?: string; // Workers binding name (e.g., R2_BUCKET)
};

export type R2MultipartUploadInfo = {
  key: string;
  uploadId: string;
};

export type R2UploadedPart = {
  partNumber: number;
  etag: string;
};

type R2MultipartUploadBinding = {
  key: string;
  uploadId: string;
  uploadPart: (partNumber: number, value: unknown, options?: unknown) => Promise<R2UploadedPart>;
  complete: (uploadedParts: R2UploadedPart[]) => Promise<unknown>;
  abort: () => Promise<void>;
};

type R2BucketBinding = {
  put: (key: string, value: unknown, options?: unknown) => Promise<unknown>;
  get: (key: string, options?: unknown) => Promise<unknown>;
  head: (key: string) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
  createMultipartUpload: (key: string, options?: unknown) => Promise<R2MultipartUploadBinding>;
  resumeMultipartUpload: (key: string, uploadId: string) => R2MultipartUploadBinding;
};

type WorkersObjectWithArrayBuffer = {
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type WorkersObjectWithBody = {
  body: Uint8Array;
};

const resolveWorkersBucket = (config: R2Config): R2BucketBinding => {
  const binding = Cloudflare.getR2Binding(config.binding) as R2BucketBinding | null;
  if (binding === null || typeof binding !== 'object') {
    throw ErrorFactory.createConfigError(
      'R2 requires a Workers R2 binding (set config.binding or R2_BUCKET/R2/BUCKET).'
    );
  }
  return binding;
};

const resolveWorkersMultipartBucket = (config: R2Config): R2BucketBinding => {
  const binding = resolveWorkersBucket(config);
  if (typeof binding.createMultipartUpload !== 'function') {
    throw ErrorFactory.createConfigError(
      'R2 multipart requires a Workers R2 binding with multipart support (set config.binding or R2_BUCKET/R2/BUCKET).'
    );
  }
  return binding;
};

const resolveWorkersObjectBody = async (object: unknown): Promise<Buffer> => {
  if (object === null || object === undefined) {
    throw ErrorFactory.createNotFoundError('R2 get failed', { status: 404 });
  }

  if (
    typeof object === 'object' &&
    object !== null &&
    'arrayBuffer' in object &&
    typeof object.arrayBuffer === 'function'
  ) {
    return Buffer.from(await (object as WorkersObjectWithArrayBuffer).arrayBuffer());
  }

  if (
    typeof object === 'object' &&
    object !== null &&
    'body' in object &&
    object.body instanceof Uint8Array
  ) {
    return Buffer.from((object as WorkersObjectWithBody).body);
  }

  throw ErrorFactory.createConfigError('R2 get failed: unsupported Workers object body');
};

const hasWorkersBucketBinding = (config: R2Config): boolean => {
  return Cloudflare.getR2Binding(config.binding) !== null;
};

export const R2Driver = Object.freeze({
  async createMultipartUpload(
    config: R2Config,
    key: string,
    options?: unknown
  ): Promise<R2MultipartUploadInfo> {
    const bucket = resolveWorkersMultipartBucket(config);
    const upload = await bucket.createMultipartUpload(key, options);
    return { key: upload.key ?? key, uploadId: upload.uploadId };
  },

  async uploadPart(
    config: R2Config,
    key: string,
    uploadId: string,
    partNumber: number,
    value: unknown,
    options?: unknown
  ): Promise<R2UploadedPart> {
    const bucket = resolveWorkersMultipartBucket(config);
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    return upload.uploadPart(partNumber, value, options);
  },

  async completeMultipartUpload(
    config: R2Config,
    key: string,
    uploadId: string,
    uploadedParts: R2UploadedPart[]
  ): Promise<string> {
    const bucket = resolveWorkersMultipartBucket(config);
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    await upload.complete(uploadedParts);
    return R2Driver.url(config, key);
  },

  async abortMultipartUpload(config: R2Config, key: string, uploadId: string): Promise<void> {
    const bucket = resolveWorkersMultipartBucket(config);
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    await upload.abort();
  },

  async put(config: R2Config, key: string, content: string | Buffer): Promise<string> {
    if (hasWorkersBucketBinding(config)) {
      const bucket = resolveWorkersBucket(config);
      const body = typeof content === 'string' ? content : Buffer.from(content);
      await bucket.put(key, body);
      return R2Driver.url(config, key);
    }

    if (typeof config.endpoint !== 'string' || config.endpoint.trim() === '') {
      throw ErrorFactory.createConfigError('R2: missing endpoint');
    }

    // Delegate to S3Driver using path-style endpoint
    const s3Config: S3Config & { usePathStyle?: boolean } = {
      bucket: config.bucket,
      region: config.region ?? 'auto',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      usePathStyle: true,
    };

    await S3Driver.put(s3Config, key, content);
    // Return the public-facing URL (custom domain when configured), not the
    // path-style signing URL produced by S3Driver.put.
    return R2Driver.url(config, key);
  },

  async get(config: R2Config, key: string): Promise<Buffer> {
    if (hasWorkersBucketBinding(config)) {
      const bucket = resolveWorkersBucket(config);
      const object = await bucket.get(key);
      return resolveWorkersObjectBody(object);
    }

    const s3Config: S3Config & { usePathStyle?: boolean } = {
      bucket: config.bucket,
      region: config.region ?? 'auto',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      usePathStyle: true,
    };

    return S3Driver.get(s3Config, key);
  },

  async exists(config: R2Config, key: string): Promise<boolean> {
    if (hasWorkersBucketBinding(config)) {
      const bucket = resolveWorkersBucket(config);
      const object = await bucket.head(key);
      return object !== null;
    }

    const s3Config: S3Config & { usePathStyle?: boolean } = {
      bucket: config.bucket,
      region: config.region ?? 'auto',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      usePathStyle: true,
    };

    return S3Driver.exists(s3Config, key);
  },

  async delete(config: R2Config, key: string): Promise<void> {
    if (hasWorkersBucketBinding(config)) {
      const bucket = resolveWorkersBucket(config);
      await bucket.delete(key);
      return;
    }

    const s3Config: S3Config & { usePathStyle?: boolean } = {
      bucket: config.bucket,
      region: config.region ?? 'auto',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      usePathStyle: true,
    };

    return S3Driver.delete(s3Config, key);
  },

  url(config: R2Config, key: string): string {
    // Prefer an explicit public base URL (custom domain CNAME'd to the bucket root):
    // no bucket segment, since the domain already resolves to the bucket. The signing
    // `endpoint` (used by tempUrl/put/get) stays path-style and independent.
    const publicBase = config.url?.trim() ?? '';
    if (publicBase !== '') return `${publicBase.replace(/\/$/, '')}/${key}`;

    if (config.endpoint !== undefined && config.endpoint.trim() !== '') {
      return `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`;
    }
    return `https://${config.bucket}.r2.cloudflarestorage.com/${key}`;
  },

  tempUrl(
    config: R2Config,
    key: string,
    options?: { expiresIn?: number; method?: 'GET' | 'PUT' }
  ): string {
    if (typeof config.endpoint !== 'string' || config.endpoint.trim() === '') {
      throw ErrorFactory.createConfigError('R2: missing endpoint');
    }

    const s3Config: S3Config & { usePathStyle?: boolean } = {
      bucket: config.bucket,
      region: config.region ?? 'auto',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      usePathStyle: true,
    };

    return S3Driver.tempUrl(s3Config, key, options);
  },
});

export default R2Driver;
