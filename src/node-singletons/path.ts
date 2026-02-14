/**
 * Node.js Path Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:path built-in
 */

import * as path from 'node:path';

export const { basename, delimiter, dirname, extname, join, relative, resolve, sep, posix, win32 } =
  path;

export default path;
