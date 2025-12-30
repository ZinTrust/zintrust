import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { LocalSignedUrl } from '@storage/LocalSignedUrl';

export type LocalConfig = {
  root: string;
  url?: string;
};

export const LocalDriver = Object.freeze({
  resolveKey(config: LocalConfig, key: string): string {
    if (!config.root || config.root.trim() === '') {
      throw ErrorFactory.createConfigError('Local storage root is not configured');
    }

    if (key.trim() === '') {
      throw ErrorFactory.createValidationError('Local storage: key is required');
    }

    if (key.startsWith('/') || key.startsWith('\\')) {
      throw ErrorFactory.createValidationError('Local storage: key must be relative');
    }

    const segments = key.split(/[/\\]+/g);
    if (segments.some((s) => s === '..' || s === '.')) {
      throw ErrorFactory.createValidationError('Local storage: invalid key');
    }

    const fullPath = path.resolve(path.join(config.root, key));

    return fullPath;
  },

  async put(config: LocalConfig, key: string, content: string | Buffer): Promise<string> {
    const fullPath = LocalDriver.resolveKey(config, key);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    if (typeof content === 'string') {
      await fs.writeFile(fullPath, content, 'utf8');
    } else {
      await fs.writeFile(fullPath, content);
    }

    return fullPath;
  },

  async get(config: LocalConfig, key: string): Promise<Buffer> {
    const fullPath = LocalDriver.resolveKey(config, key);
    try {
      return await fs.readFile(fullPath);
    } catch (err: unknown) {
      throw ErrorFactory.createNotFoundError('Local storage: file not found', { key, error: err });
    }
  },

  async exists(config: LocalConfig, key: string): Promise<boolean> {
    const fullPath = LocalDriver.resolveKey(config, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  },

  async delete(config: LocalConfig, key: string): Promise<void> {
    const fullPath = LocalDriver.resolveKey(config, key);
    try {
      await fs.unlink(fullPath);
    } catch {
      // ignore not found
    }
  },

  url(config: LocalConfig, key: string): string | undefined {
    if (config?.url === undefined || config.url.trim() === '') return undefined;
    return `${config.url.replace(/\/$/, '')}/${key}`;
  },

  tempUrl(
    config: LocalConfig,
    key: string,
    options?: { expiresIn?: number; method?: 'GET' | 'PUT' }
  ): string {
    if (options?.method === 'PUT') {
      throw ErrorFactory.createValidationError('Local storage: tempUrl does not support PUT');
    }

    if (config?.url === undefined || config.url.trim() === '') {
      throw ErrorFactory.createConfigError(
        'Local storage: url is not configured (set STORAGE_URL)'
      );
    }

    const appKey = Env.get('APP_KEY', '');
    if (appKey.trim() === '') {
      throw ErrorFactory.createConfigError(
        'Local storage: APP_KEY is required for signed tempUrl()'
      );
    }

    // Ensure key is safe before embedding in a signed token.
    LocalDriver.resolveKey(config, key);

    const expiresInMs = Math.max(1, options?.expiresIn ?? 60_000);
    const exp = Date.now() + expiresInMs;
    const token = LocalSignedUrl.createToken({ disk: 'local', key, exp, method: 'GET' }, appKey);

    const baseUrl = config.url.replace(/\/$/, '');
    return `${baseUrl}/download?token=${encodeURIComponent(token)}`;
  },
});

export default LocalDriver;
