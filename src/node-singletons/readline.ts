/**
 * Node.js Readline Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:readline built-in
 */

import * as readline from 'node:readline';

export const { createInterface, cursorTo } = readline;
export type { Interface } from 'node:readline';

export default readline;
