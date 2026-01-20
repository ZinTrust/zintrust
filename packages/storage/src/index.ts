export type {
  MultipartFieldValue,
  MultipartParseInput,
  MultipartParserProvider,
  ParsedMultipartData,
} from '@zintrust/core';

export {
  registerStreamingMultipartParser,
  type StreamingMultipartParserOptions,
} from './registerStreamingMultipartParser';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_STORAGE_VERSION = '0.1.19';
export const _ZINTRUST_STORAGE_BUILD_DATE = '__BUILD_DATE__';
