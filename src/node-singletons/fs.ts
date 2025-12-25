/**
 * Node.js File System Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:fs and node:fs/promises built-ins
 */

import * as fs from 'node:fs';

// Many parts of the CLI codebase use the "fsPromises" naming convention.
// Exporting it here keeps imports consistent and makes Vitest mocking of
// `node:fs/promises` flow through this singleton layer.
export * as fsPromises from 'node:fs/promises';

export {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

export type { Stats } from 'node:fs';

export { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

// Default export for compatibility
export default fs;
