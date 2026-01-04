import { storageConfig } from '@config/storage';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { LocalDriver } from '@storage/drivers/Local';
import { StorageDriverRegistry } from '@storage/StorageDriverRegistry';

export type DiskName = 'local' | 's3' | 'gcs' | 'r2';

export type StorageDisk = {
  driver: unknown;
  config: unknown;
};

type TempUrlOptions = { expiresIn?: number; method?: 'GET' | 'PUT' };

const normalizers: Record<string, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  local: (raw) => ({
    root: String(raw['root'] ?? ''),
    url: typeof raw['url'] === 'string' ? raw['url'] : undefined,
  }),
  s3: (raw) => ({
    bucket: String(raw['bucket'] ?? ''),
    region: String(raw['region'] ?? ''),
    accessKeyId: String(raw['accessKeyId'] ?? raw['key'] ?? ''),
    secretAccessKey: String(raw['secretAccessKey'] ?? raw['secret'] ?? ''),
    endpoint: typeof raw['endpoint'] === 'string' ? raw['endpoint'] : undefined,
    usePathStyle: Boolean(raw['usePathStyle'] ?? raw['usePathStyleUrl'] ?? false),
  }),
  r2: (raw) => ({
    bucket: String(raw['bucket'] ?? ''),
    region: typeof raw['region'] === 'string' ? raw['region'] : undefined,
    accessKeyId: String(raw['accessKeyId'] ?? raw['key'] ?? ''),
    secretAccessKey: String(raw['secretAccessKey'] ?? raw['secret'] ?? ''),
    endpoint: typeof raw['endpoint'] === 'string' ? raw['endpoint'] : undefined,
    url: typeof raw['url'] === 'string' ? raw['url'] : undefined,
  }),
  gcs: (raw) => ({
    bucket: String(raw['bucket'] ?? ''),
    projectId: typeof raw['projectId'] === 'string' ? raw['projectId'] : undefined,
    keyFile: typeof raw['keyFile'] === 'string' ? raw['keyFile'] : undefined,
    url: typeof raw['url'] === 'string' ? raw['url'] : undefined,
  }),
};

const normalizeDiskConfig = (
  driverName: string,
  raw: Record<string, unknown>
): Record<string, unknown> => {
  return normalizers[driverName]?.(raw) ?? raw;
};

export const Storage = Object.freeze({
  getDisk(name?: string): StorageDisk {
    const diskName = name ?? storageConfig.default;
    // disk is config object; dispatch based on requested name
    const drivers = storageConfig.drivers as Record<string, { driver: string }>;
    const config = drivers[diskName] as unknown as Record<string, unknown> | undefined;
    if (config === undefined)
      throw ErrorFactory.createValidationError('Storage: unknown disk', { disk: diskName });

    const driverName = String(config['driver'] ?? '')
      .trim()
      .toLowerCase();

    if (driverName === 'local') {
      return { driver: LocalDriver, config: normalizeDiskConfig('local', config) };
    }

    const entry = StorageDriverRegistry.get(driverName);
    if (entry === undefined) {
      if (driverName === 's3' || driverName === 'r2' || driverName === 'gcs') {
        throw ErrorFactory.createConfigError(
          `Storage driver not registered: ${driverName} (run \`zin add storage:${driverName}\` / \`npm i @zintrust/storage-${driverName}\`)`
        );
      }

      throw ErrorFactory.createValidationError('Storage: unsupported disk driver', {
        driver: config['driver'],
      });
    }

    const normalizedConfig =
      typeof entry.normalize === 'function'
        ? entry.normalize(config)
        : normalizeDiskConfig(driverName, config);

    return { driver: entry.driver, config: normalizedConfig };
  },

  async put(disk: string | undefined, path: string, contents: string | Buffer): Promise<string> {
    const d = Storage.getDisk(disk);
    const driver = d.driver as {
      put: (config: unknown, key: string, content: string | Buffer) => Promise<string>;
    };
    if (typeof driver.put !== 'function') {
      throw ErrorFactory.createConfigError('Storage: driver is missing put()');
    }
    return driver.put(d.config, path, contents);
  },

  async get(disk: string | undefined, path: string): Promise<Buffer> {
    const d = Storage.getDisk(disk);
    const driver = d.driver as {
      get: (config: unknown, key: string) => Promise<Buffer> | Buffer;
    };
    if (typeof driver.get !== 'function') {
      throw ErrorFactory.createConfigError('Storage: driver is missing get()');
    }
    return driver.get(d.config, path);
  },

  async exists(disk: string | undefined, path: string): Promise<boolean> {
    const d = Storage.getDisk(disk);
    const driver = d.driver as {
      exists?: (config: unknown, key: string) => Promise<boolean> | boolean;
    };
    if (typeof driver.exists !== 'function') return true;
    return Boolean(await driver.exists(d.config, path));
  },

  async delete(disk: string | undefined, path: string): Promise<void> {
    const d = Storage.getDisk(disk);
    const driver = d.driver as {
      delete?: (config: unknown, key: string) => Promise<void> | void;
    };
    if (typeof driver.delete !== 'function') return;
    await driver.delete(d.config, path);
  },

  url(disk: string | undefined, path: string): string {
    const d = Storage.getDisk(disk);
    const driver = d.driver as {
      url?: (config: unknown, key: string) => string | undefined;
    };
    const url = typeof driver.url === 'function' ? driver.url(d.config, path) : undefined;
    if (typeof url !== 'string' || url.trim() === '') {
      throw ErrorFactory.createConfigError('Storage: driver cannot build url()');
    }
    return url;
  },

  async tempUrl(disk: string | undefined, path: string, options?: TempUrlOptions): Promise<string> {
    const d = Storage.getDisk(disk);
    const driver = d.driver as {
      tempUrl?: (
        config: unknown,
        key: string,
        options?: TempUrlOptions
      ) => string | Promise<string>;
      url?: (config: unknown, key: string) => string | undefined;
    };

    if (typeof driver.tempUrl === 'function') {
      return driver.tempUrl(d.config, path, options);
    }

    const url = typeof driver.url === 'function' ? driver.url(d.config, path) : undefined;
    if (typeof url !== 'string' || url.trim() === '') {
      throw ErrorFactory.createConfigError('Storage: driver does not support tempUrl()');
    }
    return url;
  },
});

export default Storage;
