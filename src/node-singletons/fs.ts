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
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';

export type { PathLike, ReadStream, Stats, WriteStream, WriteStreamOptions } from 'node:fs';

export { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';

// Default export for compatibility
export default fs;
