# Lazy Imports Missing .js Extensions in dist/

This document lists all `await import(...)` statements in the dist/ folder that are missing .js extensions and need to be fixed.

## Files Requiring Changes

### 1. dist/src/config/logger.js

**Line 573:**

```javascript
// Current:
const mod = await import('./logging/KvLogger');

// Should be:
const mod = await import('./logging/KvLogger.js');
```

**Line 582:**

```javascript
// Current:
const mod = await import('./logging/SlackLogger');

// Should be:
const mod = await import('./logging/SlackLogger.js');
```

**Line 590:**

```javascript
// Current:
const mod = await import('./logging/HttpLogger');

// Should be:
const mod = await import('./logging/HttpLogger.js');
```

**Line 792:**

```javascript
// Current:
const mod = await import('./FileLogWriter');

// Should be:
const mod = await import('./FileLogWriter.js');
```

## Comprehensive Search Results

The following files were checked and found to have NO imports needing fixes (all imports are correct):

- dist/bin/zintrust-main.js - All imports have .js extensions or are external packages
- dist/packages/trace/src/register.js - All imports are correct
- dist/packages/trace/src/cli-register.js - All imports are correct
- dist/packages/trace/src/storage/TraceContentBudget.js - All imports are correct
- dist/packages/workers/src/queueMonitorHistory.js - All imports are correct
- dist/packages/workers/src/PriorityQueue.js - All imports are correct
- dist/packages/workers/src/Observability.js - All imports are external packages
- dist/packages/workers/src/WorkerFactory.js - All imports are dynamic variables
- dist/packages/workers/src/register.js - All imports are correct
- dist/packages/workers/src/dashboard/workers-api.js - All imports have .js extensions
- dist/packages/cache-redis/src/index.js - All imports are external packages
- dist/packages/queue-redis/src/register.js - All imports have .js extensions
- dist/packages/queue-redis/src/RedisPublishClient.js - All imports are external packages
- dist/packages/socket/src/register.js - All imports are correct
- dist/routes/mail.js - Commented import, no action needed
- dist/routes/broadcast.js - All imports have .js extensions
- dist/src/microservices/PostgresAdapter.js - External package import
- dist/src/migrations/MigrationLoader.js - Dynamic import with variable
- dist/src/boot.js - All imports have .js extensions
- dist/src/tools/notification/Notification.js - All imports have .js extensions
- dist/src/tools/mail/drivers/Cloudflare.js - External package import
- dist/src/tools/mail/drivers/Smtp.js - All imports have .js extensions
- dist/src/tools/mail/template-loader.js - Dynamic import with variable
- dist/src/tools/mail/index.js - All imports have .js extensions
- dist/src/tools/storage/drivers/Gcs.js - Dynamic import with variable
- dist/src/tools/queue/QueueRuntimeRegistration.js - Package import
- dist/src/tools/queue/QueueExtensions.js - All imports have .js extensions
- dist/src/tools/broadcast/Broadcast.js - Package import
- dist/src/start.js - All imports have .js extensions
- dist/src/trace/SystemTraceBridge.js - Package import
- dist/src/proxy/mongodb/MongoDBProxyServer.js - External package import
- dist/src/proxy/sqlserver/SqlServerProxyServer.js - External package import
- dist/src/proxy/email/ZintrustEmailProxy.js - External package import
- dist/src/boot/bootstrap.js - Dynamic import with variable
- dist/src/boot/registry/runtime.js - Dynamic imports with variables
- dist/src/boot/registry/registerRoute.js - Dynamic imports with variables
- dist/src/sockets/CloudflareSocket.js - External package import
- dist/src/config/redis.js - Package import and dynamic imports
- dist/src/security/Encryptor.js - External package import
- dist/src/security/Hash.js - External package import
- dist/src/runtime/WorkersModule.js - Dynamic imports with variables
- dist/src/runtime/plugins/trace.js - Package import and dynamic imports
- dist/src/runtime/plugins/trace-runtime.js - Package import and dynamic imports
- dist/src/runtime/useFileLoader.js - Dynamic imports with variables
- dist/src/runtime/ProjectBootstrap.js - Dynamic import with variable
- dist/src/runtime/NodeStartup.js - All imports have .js extensions
- dist/src/runtime/WorkerProjectAutoImports.js - Dynamic import with variable
- dist/src/runtime/PluginAutoImports.js - Dynamic imports with variables
- dist/src/runtime/ProjectRuntime.js - Dynamic import with variable
- dist/src/runtime/resolveNodeProjectRoot.js - All imports have .js extensions
- dist/src/runtime/WorkerAdapterImports.js - All imports have .js extensions
- dist/src/cli/OptionalCliExtensions.js - Dynamic imports with variables
- dist/src/cli/commands/MySqlProxyCommand.js - All imports have .js extensions
- dist/src/cli/commands/RoutesCommand.js - All imports have .js extensions
- dist/src/cli/commands/QACommand.js - All imports have .js extensions
- dist/src/cli/commands/schedule/ScheduleCliSupport.js - All imports have .js extensions
- dist/src/cli/commands/TraceCommands.js - Package import
- dist/src/cli/commands/SqlServerProxyCommand.js - Node built-in imports
- dist/src/cli/commands/MongoDBProxyCommand.js - Node built-in imports
- dist/src/cli/commands/QueueCommand.js - All imports have .js extensions
- dist/src/observability/PrometheusMetrics.js - External package import
- dist/src/zintrust.runtime.wg.js - All imports have .js extensions
- dist/src/common/HealthRoutes.js - All imports have .js extensions
- dist/src/common/index.js - All imports have .js extensions
- dist/src/http/RequestContext.js - All imports have .js extensions
- dist/src/seeders/SeederLoader.js - Dynamic import with variable
- dist/src/functions/cloudflare.js - Developer config paths (@runtime-config/\*.ts) - should remain as .ts
- dist/src/zintrust.runtime.js - All imports have .js extensions
- dist/src/orm/adapters/SQLiteAdapter.js - External package import
- dist/src/orm/SchemaStatemenWriter.js - All imports have .js extensions
- dist/src/orm/ConnectionManager.js - All imports have .js extensions
- dist/src/performance/Optimizer.js - All imports have .js extensions

## Notes

- Template files (.tpl) in `dist/src/templates/project/*` are intentionally excluded as they generate source code
- `@runtime-config/*` paths are developer config aliases that should remain as `.ts`
- External package imports (like `@zintrust/core`, `pg`, `prom-client`, `mongodb`, etc.) don't need extensions
- Node built-in imports (like `node:fs`, `node:child_process`) don't need extensions
- Cloudflare imports (like `cloudflare:email`, `cloudflare:sockets`) don't need extensions
- Commented-out imports are excluded
- Variable-based dynamic imports (like `await import(url)`, `await import(modulePath)`) are intentionally dynamic
- All other relative imports in the dist/ folder already have proper `.js` extensions

## Summary

- **Total files analyzed**: 70+ files with `await import()` statements
- **Files needing fixes**: 1 file
- **Total imports to fix**: 4 imports

Only `dist/src/config/logger.js` needs to be fixed with 4 relative imports missing `.js` extensions.
