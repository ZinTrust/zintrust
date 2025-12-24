/**
 * Node.js File System Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:fs and node:fs/promises built-ins
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

export { fs, fsPromises };

export {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
