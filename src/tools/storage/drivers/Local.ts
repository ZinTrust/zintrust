import { ErrorFactory } from '@exceptions/ZintrustError';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export type LocalConfig = {
  root: string;
  url?: string;
};

export const LocalDriver = Object.freeze({
  async put(config: LocalConfig, key: string, content: string | Buffer): Promise<string> {
    const root = config.root;
    if (!root || root.trim() === '') {
      throw ErrorFactory.createConfigError('Local storage root is not configured');
    }

    const fullPath = path.join(root, key);
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
    const fullPath = path.join(config.root, key);
    try {
      return await fs.readFile(fullPath);
    } catch (err: unknown) {
      throw ErrorFactory.createNotFoundError('Local storage: file not found', { key, error: err });
    }
  },

  async exists(config: LocalConfig, key: string): Promise<boolean> {
    const fullPath = path.join(config.root, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  },

  async delete(config: LocalConfig, key: string): Promise<void> {
    const fullPath = path.join(config.root, key);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      // ignore not found
      void err;
    }
  },

  url(config: LocalConfig, key: string): string | undefined {
    if (config?.url === undefined || config.url.trim() === '') return undefined;
    return `${config.url.replace(/\/$/, '')}/${key}`;
  },

  tempUrl(
    config: LocalConfig,
    key: string,
    _options?: { expiresIn?: number; method?: 'GET' | 'PUT' }
  ): string {
    const url = LocalDriver.url(config, key);
    if (url === undefined) {
      throw ErrorFactory.createConfigError(
        'Local storage: url is not configured (set STORAGE_URL)'
      );
    }
    return url;
  },
});

export default LocalDriver;
