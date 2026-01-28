/**
 * Routing Common Utilities
 * Shared helpers for static routes and content-type resolution.
 */

import { MIME_TYPES } from '@config/constants';
import * as path from '@node-singletons/path';

/**
 * MIME types for static file serving.
 */
export const MIME_TYPES_MAP: Record<string, string> = {
  '.html': MIME_TYPES.HTML,
  '.js': MIME_TYPES.JS,
  '.css': MIME_TYPES.CSS,
  '.json': MIME_TYPES.JSON,
  '.png': MIME_TYPES.PNG,
  '.jpg': MIME_TYPES.JPG,
  '.gif': MIME_TYPES.GIF,
  '.svg': MIME_TYPES.SVG,
  '.wav': MIME_TYPES.WAV,
  '.mp4': MIME_TYPES.MP4,
  '.woff': MIME_TYPES.WOFF,
  '.ttf': MIME_TYPES.TTF,
  '.eot': MIME_TYPES.EOT,
  '.otf': MIME_TYPES.OTF,
  '.wasm': MIME_TYPES.WASM,
};

export const tryDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Resolves a relative path against a base directory and ensures it stays within it.
 * Returns undefined if the resolved path escapes the base.
 */
export const resolveSafePath = (baseDir: string, relativePath: string): string | undefined => {
  const baseAbs = path.resolve(baseDir);
  const candidate = path.resolve(baseDir, relativePath);

  if (candidate === baseAbs) return candidate;
  if (!candidate.startsWith(baseAbs + path.sep)) return undefined;

  return candidate;
};
