import fs from 'node:fs';
import path from 'node:path';

/**
 * Common utilities - Sealed namespace for immutability
 */
export const CommonUtils = Object.freeze({
  /**
   * Resolve npm executable path from Node.js installation
   */
  resolveNpmPath(): string {
    const nodeBinDir = path.dirname(process.execPath);
    const candidates =
      process.platform === 'win32'
        ? [path.join(nodeBinDir, 'npm.cmd'), path.join(nodeBinDir, 'npm.exe')]
        : [path.join(nodeBinDir, 'npm')];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(
      'Unable to locate npm executable. Ensure Node.js (with npm) is installed in the standard location.'
    );
  },
});

// Re-export for backward compatibility
export const resolveNpmPath = (): string => CommonUtils.resolveNpmPath();
