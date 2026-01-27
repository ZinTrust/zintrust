/**
 * ZinTrust Application Entry Point
 */

import { isNodeMain, start } from '@zintrust/core/start';

// Cloudflare Workers entry.
export { default } from '@zintrust/core/start';

// Node entry (when executed as `node src/index.ts` / `tsx src/index.ts` etc.).
if (isNodeMain(import.meta.url)) {
  await start();
}
