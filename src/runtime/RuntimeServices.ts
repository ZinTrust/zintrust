/**
 * Runtime Services
 * Adapter layer for env/crypto/timers/fs/fetch across Node and Workers
 * Sealed namespace for immutability
 */

import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { randomUUID as nodeRandomUUID, randomBytes } from '@node-singletons/crypto';
import * as nodeFs from '@node-singletons/fs';

export type RuntimePlatform = 'nodejs' | 'lambda' | 'fargate' | 'cloudflare' | 'deno';

export type RuntimeEnvReader = {
  get: (key: string, defaultValue?: string) => string;
  getInt: (key: string, defaultValue?: number) => number;
  getFloat: (key: string, defaultValue?: number) => number;
  getBool: (key: string, defaultValue?: boolean) => boolean;
};

export type RandomValuesArray =
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array
  | BigInt64Array
  | BigUint64Array;

export type RuntimeCrypto = {
  subtle: SubtleCrypto;
  getRandomValues: <T extends RandomValuesArray>(array: T) => T;
  randomUUID: () => string;
  randomBytes?: (size: number) => Uint8Array;
};

export type RuntimeTimers = {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
};

export type RuntimeFs = {
  supported: boolean;
  readFileSync: (path: string, encoding?: BufferEncoding) => string | Buffer;
  readdirSync: (path: string) => string[];
  existsSync: (path: string) => boolean;
};

export type RuntimeServices = {
  platform: RuntimePlatform;
  env: RuntimeEnvReader;
  crypto: RuntimeCrypto;
  timers: RuntimeTimers;
  fs: RuntimeFs;
  fetch: typeof fetch;
};

export const detectCloudflareWorkers = (): boolean => {
  return Cloudflare.getWorkersEnv() !== null;
};

export const detectRuntimePlatform = (): RuntimePlatform => {
  if (detectCloudflareWorkers()) return 'cloudflare';
  return 'nodejs';
};

export const RUNTIME_PLATFORM: RuntimePlatform = detectRuntimePlatform();

const normalizeEnvValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
};

const readEnvFromRecord = (record: Record<string, unknown>, key: string): string => {
  return normalizeEnvValue(record[key]);
};

const createWorkersEnvReader = (): RuntimeEnvReader => {
  return {
    get(key: string, defaultValue: string = ''): string {
      const env = Cloudflare.getWorkersEnv() ?? {};
      const value = readEnvFromRecord(env, key);
      return value === '' ? defaultValue : value;
    },
    getInt(key: string, defaultValue: number = 0): number {
      const raw = this.get(key, String(defaultValue));
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    },
    getFloat(key: string, defaultValue: number = 0): number {
      const raw = this.get(key, String(defaultValue));
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    },
    getBool(key: string, defaultValue: boolean = false): boolean {
      const raw = this.get(key, defaultValue ? 'true' : 'false').toLowerCase();
      if (raw === '') return defaultValue;
      return raw === 'true' || raw === '1';
    },
  };
};

const createNodeEnvReader = (): RuntimeEnvReader => {
  return {
    get: (key: string, defaultValue?: string) => Env.get(key, defaultValue),
    getInt: (key: string, defaultValue?: number) => Env.getInt(key, defaultValue),
    getFloat: (key: string, defaultValue?: number) => Env.getFloat(key, defaultValue),
    getBool: (key: string, defaultValue?: boolean) => Env.getBool(key, defaultValue),
  };
};

const getWebCrypto = (): Crypto => {
  if (globalThis.crypto === undefined) {
    throw ErrorFactory.createConfigError('WebCrypto is not available in this runtime');
  }
  return globalThis.crypto as Crypto;
};

const fillRandomValues = <T extends RandomValuesArray>(webCrypto: Crypto, array: T): T => {
  if (typeof webCrypto.getRandomValues === 'function') {
    return webCrypto.getRandomValues(array as Uint8Array<ArrayBuffer>) as T;
  }

  if (array instanceof BigInt64Array || array instanceof BigUint64Array) {
    throw ErrorFactory.createConfigError('BigInt typed arrays require WebCrypto support');
  }

  const bytes = randomBytes(array.byteLength);
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  view.set(bytes);
  return array;
};

const createNodeCrypto = (): RuntimeCrypto => {
  const webCrypto = getWebCrypto();
  if (webCrypto.subtle === undefined) {
    throw ErrorFactory.createConfigError('WebCrypto subtle is not available in Node runtime');
  }

  return {
    subtle: webCrypto.subtle,
    getRandomValues: <T extends RandomValuesArray>(array: T): T => {
      return fillRandomValues(webCrypto, array);
    },
    randomUUID: () => {
      if (typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
      return nodeRandomUUID();
    },
    randomBytes: (size: number) => randomBytes(size),
  };
};

const createWorkersCrypto = (): RuntimeCrypto => {
  const webCrypto = getWebCrypto();
  if (webCrypto.subtle === undefined) {
    throw ErrorFactory.createConfigError('WebCrypto subtle is not available in Workers runtime');
  }

  return {
    subtle: webCrypto.subtle,
    getRandomValues: <T extends RandomValuesArray>(array: T): T =>
      webCrypto.getRandomValues(array as Uint8Array<ArrayBuffer>) as T,
    randomUUID: () => {
      if (typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
      return nodeRandomUUID();
    },
  };
};

const createNodeFs = (): RuntimeFs => {
  return {
    supported: true,
    readFileSync: (path: string, encoding?: BufferEncoding) => nodeFs.readFileSync(path, encoding),
    readdirSync: (path: string) => nodeFs.readdirSync(path),
    existsSync: (path: string) => nodeFs.existsSync(path),
  };
};

const createWorkersFs = (): RuntimeFs => {
  const unsupported = (): never => {
    throw ErrorFactory.createConfigError('Filesystem access is not supported in Workers runtime');
  };

  return {
    supported: false,
    readFileSync: () => unsupported(),
    readdirSync: () => unsupported(),
    existsSync: () => false,
  };
};

const createTimers = (): RuntimeTimers => ({
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
});

export const RuntimeServices = Object.freeze({
  create(platform: RuntimePlatform): RuntimeServices {
    if (platform === 'cloudflare') {
      return {
        platform,
        env: createWorkersEnvReader(),
        crypto: createWorkersCrypto(),
        timers: createTimers(),
        fs: createWorkersFs(),
        fetch: globalThis.fetch.bind(globalThis),
      };
    }

    return {
      platform,
      env: createNodeEnvReader(),
      crypto: createNodeCrypto(),
      timers: createTimers(),
      fs: createNodeFs(),
      fetch: globalThis.fetch.bind(globalThis),
    };
  },
});

export default RuntimeServices;
