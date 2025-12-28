import { S3Driver, type S3Config } from '@storage/drivers/S3';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type R2Config = {
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Cloudflare R2 endpoint (e.g., https://<accountid>.r2.cloudflarestorage.com)
};

export const R2Driver = Object.freeze({
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
    if (config.endpoint && config.endpoint.trim() !== '') {
      return `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`;
    }
    return `https://${config.bucket}.r2.cloudflarestorage.com/${key}`;
  },
});

export default R2Driver;
