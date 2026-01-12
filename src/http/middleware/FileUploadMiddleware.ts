/**
 * File Upload Middleware
 * Processes multipart/form-data requests and makes files available on request
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { MultipartParser } from '@http/parsers/MultipartParser';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

/**
 * Extract content-type header safely
 */
const getContentType = (req: IRequest): string => {
  const contentType = req.getHeader('content-type');
  if (typeof contentType === 'string') return contentType.toLowerCase().trim();
  return '';
};

/**
 * Get request body as Buffer
 */
const getRequestBody = (req: IRequest): Buffer | undefined => {
  // Check context for raw bytes (set by Server)
  const rawBytes = req.context['rawBodyBytes'];
  if (Buffer.isBuffer(rawBytes)) {
    return rawBytes;
  }

  const raw = req.getRaw();
  if (raw === undefined) return undefined;

  // Check if body has been read as Buffer (mocking/testing support)
  const body = (raw as unknown as { body?: unknown }).body;
  if (Buffer.isBuffer(body)) return body;

  // Try to convert string to Buffer
  if (typeof body === 'string') return Buffer.from(body);

  return undefined;
};

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

  // Only process multipart/form-data requests
  if (!MultipartParser.isMultipart(contentType)) {
    await next();
    return;
  }

  try {
    const boundary = MultipartParser.getBoundary(contentType);
    if (boundary === undefined || boundary === '') {
      Logger.warn('[File Upload] Missing boundary in multipart request');
      await next();
      return;
    }

    const body = getRequestBody(req);
    if (!body) {
      await next();
      return;
    }

    // Check body size limit
    const maxBodySize = Env.getInt('REQUEST_MAX_BODY_SIZE', 10 * 1024 * 1024); // 10MB default
    if (body.length > maxBodySize) {
      Logger.warn('[File Upload] Request body exceeds size limit', {
        size: body.length,
        limit: maxBodySize,
      });
      await next();
      return;
    }

    // Parse multipart data
    const parsed = MultipartParser.parse(body, boundary);

    // Store parsed data on request for later access
    const currentBody = req.getBody?.();
    const updatedBody = typeof currentBody === 'object' && currentBody !== null ? currentBody : {};

    req.setBody({
      ...updatedBody,
      __fields: parsed.fields,
      __files: parsed.files,
    });

    if (Env.getBool('ZIN_DEBUG_FILE_UPLOAD', false)) {
      Logger.debug('[File Upload] Successfully parsed multipart data', {
        fieldsCount: Object.keys(parsed.fields).length,
        filesCount: Object.keys(parsed.files).length,
      });
    }
  } catch (error) {
    Logger.error('[File Upload] Error parsing multipart data', error);
    // Continue with unparsed body
  }

  await next();
};

export default fileUploadMiddleware;
