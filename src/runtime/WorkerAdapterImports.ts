// Worker-only adapter auto-imports for bundler-based runtimes (e.g. Cloudflare Workers).
// Keep this list limited to database adapters needed by runtime config.

import '@/zintrust.plugins.ts';
import '@runtime/durable-objects/drivers/MySqlPoolDriver';
import '@runtime/durable-objects/drivers/PostgresPoolDriver';
import '@runtime/durable-objects/drivers/RedisPoolDriver';

export const WorkerAdapterImports = Object.freeze({
  loaded: true,
});
