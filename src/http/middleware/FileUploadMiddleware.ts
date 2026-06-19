/**
 * File Upload Middleware
 * Processes multipart/form-data requests and makes files available on request
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { UploadedFile } from '@http/FileUpload';
import { MultipartParser } from '@http/parsers/MultipartParser';
import {
  MultipartParserRegistry,
  type ParsedMultipartData,
} from '@http/parsers/MultipartParserRegistry';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

type MultipartLimits = {
  maxFileSizeBytes: number;
  maxFiles: number;
  maxFields: number;
  maxFieldSizeBytes: number;
};

/**
 * Extract the original content-type header value.
 *
 * The value is NOT lowercased: multipart boundaries are case-sensitive, so a
 * browser boundary containing uppercase characters must be preserved verbatim.
 * Only the multipart check (MultipartParser.isMultipart) is case-insensitive.
 */
const getContentType = (req: IRequest): string => {
  const contentType = req.getHeader('content-type');
  if (typeof contentType === 'string') return contentType.trim();
  if (Array.isArray(contentType) && typeof contentType[0] === 'string') {
    return contentType[0].trim();
  }
  return '';
};

/**
 * Convert a buffered request body (Buffer or string) to a Buffer, if present.
 * Worker adapters often expose a buffered body rather than a Node stream.
 */
const getBufferedBody = (req: IRequest): Buffer | undefined => {
  const raw = req.getRaw() as unknown as { body?: unknown };
  const body = raw.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  return undefined;
};

/**
 * A raw request is pipeable when it exposes a Node-style readable stream, which
 * the registered streaming parser (e.g. busboy) consumes via `.pipe(...)`.
 */
const isPipeable = (req: IRequest): boolean => {
  const raw = req.getRaw() as unknown as { pipe?: unknown };
  return typeof raw.pipe === 'function';
};

/**
 * Convert a bracket-notation field name to dotted notation.
 * e.g. `doc[reg_cer]` -> `doc.reg_cer`, `doc[reg_cer][file]` -> `doc.reg_cer.file`.
 * Empty brackets (`files[]`) collapse to the base name (`files`).
 */
const toDottedName = (name: string): string => {
  let result = '';
  let cursor = 0;

  while (cursor < name.length) {
    const openBracket = name.indexOf('[', cursor);
    if (openBracket === -1) {
      result += name.slice(cursor);
      break;
    }

    result += name.slice(cursor, openBracket);

    const closeBracket = name.indexOf(']', openBracket + 1);
    if (closeBracket === -1) {
      result += name.slice(openBracket);
      break;
    }

    const inner = name.slice(openBracket + 1, closeBracket);
    if (inner !== '') {
      result += `.${inner}`;
    }

    cursor = closeBracket + 1;
  }

  return result;
};

/**
 * Add dotted-notation aliases for any bracket-notation keys, without removing
 * the original field names. Existing keys are never overwritten.
 */
const addDottedAliases = <T>(record: Record<string, T>): Record<string, T> => {
  const out: Record<string, T> = { ...record };
  for (const [key, value] of Object.entries(record)) {
    if (!key.includes('[')) continue;
    const dotted = toDottedName(key);
    if (dotted !== '' && dotted !== key && !(dotted in out)) {
      out[dotted] = value;
    }
  }
  return out;
};

/**
 * Parse a buffered multipart body using the built-in parser and the original
 * (case-sensitive) boundary from the content-type header.
 */
const parseBufferedMultipart = (body: Buffer, contentType: string): ParsedMultipartData => {
  const boundary = MultipartParser.getBoundary(contentType);
  if (boundary === undefined || boundary === '') {
    throw ErrorFactory.createValidationError('Multipart upload is missing a boundary.', {
      contentType,
    });
  }
  return MultipartParser.parse(body, boundary);
};

/**
 * Resolve parsed multipart data from the request.
 *
 * Prefers a buffered binary body (Worker adapters) parsed with the built-in
 * parser. Falls back to a registered streaming parser only when the raw request
 * is pipeable (Node-style request streams).
 */
const resolveParsedMultipart = async (
  req: IRequest,
  contentType: string,
  limits: MultipartLimits
): Promise<ParsedMultipartData> => {
  const bufferedBody = getBufferedBody(req);
  if (bufferedBody !== undefined) {
    return parseBufferedMultipart(bufferedBody, contentType);
  }

  if (isPipeable(req)) {
    const provider = MultipartParserRegistry.get();
    if (provider === null) {
      throw ErrorFactory.createConfigError('Multipart upload parser is not configured.', {
        contentType,
        hint: 'Install @zintrust/storage to enable multipart/form-data uploads.',
      });
    }
    return provider({ req: req.getRaw(), contentType, limits });
  }

  throw ErrorFactory.createValidationError('Multipart upload has no readable body.', {
    contentType,
  });
};

const isConfigError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'CONFIG_ERROR';

/**
 * File upload middleware
 * Automatically parses multipart/form-data and makes files available
 */
export const fileUploadMiddleware: Middleware = async (
  req: IRequest,
  _res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const contentType = getContentType(req);

  // Only process multipart/form-data requests (case-insensitive check).
  if (!MultipartParser.isMultipart(contentType)) {
    await next();
    return;
  }

  try {
    const limits: MultipartLimits = {
      maxFileSizeBytes: Env.getInt('MAX_FILE_SIZE', 50 * 1024 * 1024),
      maxFiles: Env.getInt('MAX_FILES', 20),
      maxFields: Env.getInt('MAX_FIELDS', 200),
      maxFieldSizeBytes: Env.getInt('MAX_FIELD_SIZE', 128 * 1024),
    };

    const parsed = await resolveParsedMultipart(req, contentType, limits);

    // Add dotted aliases for bracket-notation names without dropping originals,
    // so `doc[reg_cer]` is also addressable as `doc.reg_cer`.
    const fields = addDottedAliases(parsed.fields);
    const files = addDottedAliases<UploadedFile[]>(parsed.files);

    const currentBody = req.getBody?.();
    const updatedBody = typeof currentBody === 'object' && currentBody !== null ? currentBody : {};

    // Merge fields directly into the request body for ergonomics.
    // Files remain under __files for FileUpload helper compatibility.
    req.setBody({
      ...updatedBody,
      ...fields,
      __files: files,
    });

    if (Env.getBool('ZIN_DEBUG_FILE_UPLOAD', false)) {
      Logger.debug('[File Upload] Successfully parsed multipart data', {
        fieldsCount: Object.keys(fields).length,
        filesCount: Object.keys(files).length,
      });
    }
  } catch (error) {
    // A missing streaming parser is a hard configuration error (e.g. multipart
    // arrives as a Node stream but @zintrust/storage is not installed): surface it.
    if (isConfigError(error)) throw error;
    // Other parse failures are non-fatal: log and continue with the unparsed body.
    Logger.error('[File Upload] Error parsing multipart data', error);
  }

  await next();
};

export default fileUploadMiddleware;
