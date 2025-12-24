/**
 * Node.js Path Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:path built-in
 */

export { basename, delimiter, dirname, extname, join, relative, resolve, sep } from 'node:path';
export { pathModule as default };

// Also export the full module for compatibility
import * as pathModule from 'node:path';
export const path = pathModule;
