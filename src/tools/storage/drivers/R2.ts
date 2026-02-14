import { ErrorFactory } from '@exceptions/ZintrustError';
import { Cloudflare } from '@config/cloudflare';
import { S3Driver, type S3Config } from '@storage/drivers/S3';

export type R2Config = {
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Cloudflare R2 endpoint (e.g., https://<accountid>.r2.cloudflarestorage.com)
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
  createMultipartUpload: (key: string, options?: unknown) => Promise<R2MultipartUploadBinding>;
  resumeMultipartUpload: (key: string, uploadId: string) => R2MultipartUploadBinding;
};

const resolveWorkersBucket = (config: R2Config): R2BucketBinding => {
  const binding = Cloudflare.getR2Binding(config.binding) as R2BucketBinding | null;
  if (binding === null || typeof binding.createMultipartUpload !== 'function') {
    throw ErrorFactory.createConfigError(
      'R2 multipart requires a Workers R2 binding (set config.binding or R2_BUCKET/R2/BUCKET).'
    );
  }
  return binding;
};

export const R2Driver = Object.freeze({
  async createMultipartUpload(
    config: R2Config,
    key: string,
    options?: unknown
  ): Promise<R2MultipartUploadInfo> {
    const bucket = resolveWorkersBucket(config);
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
    const bucket = resolveWorkersBucket(config);
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    return upload.uploadPart(partNumber, value, options);
  },

  async completeMultipartUpload(
    config: R2Config,
    key: string,
    uploadId: string,
    uploadedParts: R2UploadedPart[]
  ): Promise<string> {
    const bucket = resolveWorkersBucket(config);
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    await upload.complete(uploadedParts);
    return R2Driver.url(config, key);
  },

  async abortMultipartUpload(config: R2Config, key: string, uploadId: string): Promise<void> {
    const bucket = resolveWorkersBucket(config);
    const upload = bucket.resumeMultipartUpload(key, uploadId);
    await upload.abort();
  },

  async put(config: R2Config, key: string, content: string | Buffer): Promise<string> {
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

    return S3Driver.put(s3Config, key, content);
  },

  async get(config: R2Config, key: string): Promise<Buffer> {
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
