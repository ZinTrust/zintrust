import { ErrorFactory } from '@exceptions/ZintrustError';
import { describe, expect, it, vi } from 'vitest';

const mockPut = vi.fn().mockResolvedValue('ok');
const mockGet = vi.fn().mockResolvedValue(Buffer.from('data'));
const mockExists = vi.fn().mockResolvedValue(true);
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockTempUrl = vi.fn().mockReturnValue('https://signed-url');

vi.mock('@storage/drivers/S3', () => ({
  S3Driver: {
    put: (...args: any[]) => mockPut(...args),
    get: (...args: any[]) => mockGet(...args),
    exists: (...args: any[]) => mockExists(...args),
    delete: (...args: any[]) => mockDelete(...args),
    tempUrl: (...args: any[]) => mockTempUrl(...args),
  },
}));

import { R2Driver } from '@storage/drivers/R2';

describe('R2Driver', () => {
  it('throws config error when endpoint missing for put', async () => {
    await expect(
      // @ts-ignore - incomplete config
      R2Driver.put({ bucket: 'b', accessKeyId: 'a', secretAccessKey: 's' }, 'k', 'c')
    ).rejects.toThrow(ErrorFactory.createConfigError('R2: missing endpoint'));
  });

  it('delegates to S3Driver for put/get/exists/delete', async () => {
    const cfg = {
      bucket: 'b',
      endpoint: 'https://r2.local',
      accessKeyId: 'a',
      secretAccessKey: 's',
    } as any;

    await expect(R2Driver.put(cfg, 'k', 'c')).resolves.toEqual('ok');
    expect(mockPut).toHaveBeenCalled();

    await expect(R2Driver.get(cfg, 'k')).resolves.toBeInstanceOf(Buffer);
    expect(mockGet).toHaveBeenCalled();

    await expect(R2Driver.exists(cfg, 'k')).resolves.toBeTruthy();
    expect(mockExists).toHaveBeenCalled();

    await expect(R2Driver.delete(cfg, 'k')).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalled();
  });

  it('url builds endpoint-based and default URLs', () => {
    const cfg = { bucket: 'mybucket', endpoint: 'https://r2.example.com' } as any;
    expect(R2Driver.url(cfg, 'file.txt')).toBe('https://r2.example.com/mybucket/file.txt');

    expect(R2Driver.url({ bucket: 'b' } as any, 'x')).toBe('https://b.r2.cloudflarestorage.com/x');
  });

  it('tempUrl throws when endpoint missing and delegates when provided', () => {
    expect(() => R2Driver.tempUrl({ bucket: 'b' } as any, 'k')).toThrow();

    const cfg = { bucket: 'b', endpoint: 'https://r2.example.com' } as any;
    expect(R2Driver.tempUrl(cfg, 'k', { expiresIn: 60 })).toBe('https://signed-url');
    expect(mockTempUrl).toHaveBeenCalled();
  });

  it('uses Workers binding for multipart upload helpers', async () => {
    const upload = {
      key: 'file.txt',
      uploadId: 'upload-1',
      uploadPart: vi.fn().mockResolvedValue({ partNumber: 1, etag: 'etag-1' }),
      complete: vi.fn().mockResolvedValue({}),
      abort: vi.fn().mockResolvedValue(undefined),
    };

    const bucket = {
      createMultipartUpload: vi.fn().mockResolvedValue(upload),
      resumeMultipartUpload: vi.fn().mockReturnValue(upload),
    };

    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = { R2_BUCKET: bucket };

    const cfg = {
      bucket: 'b',
      accessKeyId: 'a',
      secretAccessKey: 's',
      binding: 'R2_BUCKET',
    } as any;

    const info = await R2Driver.createMultipartUpload(cfg, 'file.txt');
    expect(info).toEqual({ key: 'file.txt', uploadId: 'upload-1' });

    await expect(R2Driver.uploadPart(cfg, 'file.txt', 'upload-1', 1, 'data')).resolves.toEqual({
      partNumber: 1,
      etag: 'etag-1',
    });

    await expect(
      R2Driver.completeMultipartUpload(cfg, 'file.txt', 'upload-1', [
        { partNumber: 1, etag: 'etag-1' },
      ])
    ).resolves.toBe('https://b.r2.cloudflarestorage.com/file.txt');

    await expect(
      R2Driver.abortMultipartUpload(cfg, 'file.txt', 'upload-1')
    ).resolves.toBeUndefined();

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }
  });
});
