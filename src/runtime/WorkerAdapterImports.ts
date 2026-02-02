/* eslint-disable no-restricted-imports */
// Worker-only adapter auto-imports for bundler-based runtimes (e.g. Cloudflare Workers).
// Keep this list limited to database adapters needed by runtime config.

import '../../packages/db-d1/src/register';
import '../../packages/db-mysql/src/register';
import '../../packages/db-postgres/src/register';
import '../../packages/db-sqlite/src/register';
import '../../packages/db-sqlserver/src/register';

export const WorkerAdapterImports = Object.freeze({
  loaded: true,
});
