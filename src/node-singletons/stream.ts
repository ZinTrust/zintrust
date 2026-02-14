/**
 * Node.js Stream Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:stream built-in
 */

import * as stream from 'node:stream';

export const { Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished } = stream;

export type {
  DuplexOptions,
  ReadableOptions,
  TransformOptions,
  WritableOptions,
} from 'node:stream';
export type { ReadableStream, WritableStream } from 'node:stream/web';

export default stream;
