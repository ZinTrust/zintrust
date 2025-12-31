# type config

- Source: `src/config/type.ts`

## Usage

Import from the framework:

```ts
import { type } from '@zintrust/core';

// Example (if supported by the module):
// type.*
```

## Snapshot (top)

```ts
import { Env } from '@zintrust/core';
import type { Middleware as MiddlewareFn } from '@middleware/MiddlewareStack';

export type Environment =
  | 'development'
  | 'dev'
  | 'production'
  | 'prod'
  | 'pro'
  | 'testing'
  | 'test';
export type StartMode = 'development' | 'production' | 'testing';

export type EnvGetValue = ReturnType<typeof Env.get>;
export type EnvGetBoolValue = ReturnType<typeof Env.getBool>;

export type LocalStorageDriverConfig = {
  driver: 'local';
  root: EnvGetValue;
  url: EnvGetValue;
  visibility: EnvGetValue;
};

export type S3StorageDriverConfig = {
  driver: 's3';
  accessKeyId: EnvGetValue;
  secretAccessKey: EnvGetValue;
  region: typeof Env.AWS_REGION;
  bucket: EnvGetValue;
  url: EnvGetValue;
  endpoint: EnvGetValue;
  usePathStyleUrl: EnvGetBoolValue;
};

export type R2StorageDriverConfig = {
  driver: 'r2';
  accessKeyId: EnvGetValue;
  secretAccessKey: EnvGetValue;
  region: EnvGetValue;
  bucket: EnvGetValue;
  endpoint: EnvGetValue;
  url: EnvGetValue;
};

export type GcsStorageDriverConfig = {
  driver: 'gcs';
  projectId: EnvGetValue;
  keyFile: EnvGetValue;
  bucket: EnvGetValue;
  url: EnvGetValue;
};

export type StorageDrivers = {
  local: LocalStorageDriverConfig;
  s3: S3StorageDriverConfig;
  r2: R2StorageDriverConfig;
  gcs: GcsStorageDriverConfig;
};

export type StorageDriverName = keyof StorageDrivers;
export type StorageDriverConfig = StorageDrivers[StorageDriverName];

export type StorageConfigRuntime = {
  readonly default: string;
  readonly drivers: StorageDrivers;
};

export type StartupConfigValidationError = {
  key: string;
  value: unknown;
```

## Snapshot (bottom)

```ts
export type KvCacheDriverConfig = {
  driver: 'kv';
  ttl: number;
};

export type CacheDriverConfig =
  | MemoryCacheDriverConfig
  | RedisCacheDriverConfig
  | MongoCacheDriverConfig
  | KvCacheDriverConfig;

export type CacheDrivers = {
  memory: MemoryCacheDriverConfig;
  redis: RedisCacheDriverConfig;
  mongodb: MongoCacheDriverConfig;
  kv: KvCacheDriverConfig;
};

export type CacheConfigInput = {
  default: string;
  drivers: CacheDrivers;
};

export type KnownBroadcastDriverName = 'inmemory' | 'pusher' | 'redis' | 'redishttps';

export type InMemoryBroadcastDriverConfig = {
  driver: 'inmemory';
};

export type PusherBroadcastDriverConfig = {
  driver: 'pusher';
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  useTLS: boolean;
};

export type RedisBroadcastDriverConfig = {
  driver: 'redis';
  host: string;
  port: number;
  password: string;
  channelPrefix: string;
};

export type RedisHttpsBroadcastDriverConfig = {
  driver: 'redishttps';
  endpoint: string;
  token: string;
  channelPrefix: string;
};

export type KnownBroadcastDriverConfig =
  | InMemoryBroadcastDriverConfig
  | PusherBroadcastDriverConfig
  | RedisBroadcastDriverConfig
  | RedisHttpsBroadcastDriverConfig;
```
