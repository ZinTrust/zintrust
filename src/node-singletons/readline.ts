/**
 * Node.js Readline Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:readline built-in
 */

import * as readlineModule from 'node:readline';

export { createInterface, cursorTo } from 'node:readline';
export type { Interface } from 'node:readline';

// Also export the full module for compatibility
export default readlineModule;
