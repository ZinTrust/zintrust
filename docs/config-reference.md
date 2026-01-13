# Config reference

ZinTrust’s config system is split into focused modules under `src/config/*` and aggregated into a single export surface.

Use this page as a table of contents. For “how do I import config in my app?” start with the config index doc.

## How to consume config

Typical usage is:

```ts
import { Config } from '@zintrust/core';

const loggerConfig = Config.logger;
const storageConfig = Config.storage;
```

Some features are _configuration + runtime singleton_ (for example SecretsManager). In those cases:

- Read normalized config from `Config.*`.
- Initialize the runtime singleton once during boot.

## Generated list

The list below is derived from `src/config/` and is intended to stay in sync as new modules are added.

If anything here disagrees with actual runtime behavior, the authoritative source is the corresponding `src/config/*.ts` file.

- [FileLogWriter.ts](./config-file-log-writer.md)
- [SecretsManager.ts](./config-secrets-manager.md)
- [StartupConfigValidator.ts](./config-startup-config-validator.md)
- [app.ts](./config-app.md)
- [broadcast.ts](./config-broadcast.md)
- [cache.ts](./config-cache.md)
- [cloudflare.ts](./config-cloudflare.md)
- [constants.ts](./config-constants.md)
- [database.ts](./config-database.md)
- [env.ts](./config-env.md)
- [features.ts](./config-features.md)
- [index.ts](./config-index.md)
- [logger.ts](./config-logger.md)
- [logging/HttpLogger.ts](./config-logging-http-logger.md)
- [logging/KvLogger.ts](./config-logging-kv-logger.md)
- [logging/SlackLogger.ts](./config-logging-slack-logger.md)
- [mail.ts](./config-mail.md)
- [microservices.ts](./config-microservices.md)
- [middleware.ts](./config-middleware.md)
- [notification.ts](./config-notification.md)
- [queue.ts](./config-queue.md)
- [security.ts](./config-security.md)
- [startup.ts](./config-startup.md)
- [storage.ts](./config-storage.md)
- [type.ts](./config-type.md)
