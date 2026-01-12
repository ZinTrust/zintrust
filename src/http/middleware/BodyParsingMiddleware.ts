/**
 * Content Type Detection & Body Parsing Middleware
 * Detects content-type and parses non-JSON request bodies
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { BodyParsers } from '@http/parsers/BodyParsers';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';

/**
 * Get content-type from request headers
 */
const getContentType = (req: IRequest): string => {
  const contentType = req.getHeader('content-type');
  if (typeof contentType === 'string') return contentType.split(';')[0].toLowerCase().trim();
  return '';
};

/**
 * Check if body should be parsed (not already JSON)
 */
const shouldParseBody = (contentType: string): boolean => {
  if (contentType.includes('application/json')) return false;
  if (contentType === '') return false;
  return true;
};

/**
 * Get request body as Buffer or string
 */
const getRequestBody = (req: IRequest): string | Buffer | undefined => {
  // Check context for raw bytes/text (set by Server)
  const rawBytes = req.context['rawBodyBytes'];
  if (Buffer.isBuffer(rawBytes)) {
    return rawBytes;
  }
  const rawText = req.context['rawBodyText'];
  if (typeof rawText === 'string') {
    return rawText;
  }

  const raw = req.getRaw();
  if (raw === undefined) return undefined;

  // Check if body has been read as Buffer or string
  const body = (raw as unknown as { body?: unknown }).body;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body;

  return undefined;
};

/**
 * Body parsing middleware
 * Automatically detects content-type and parses non-JSON bodies
 */
export const bodyParsingMiddleware: Middleware = async (
  req: IRequest,
  _res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const contentType = getContentType(req);

  // Only parse non-JSON bodies
  if (!shouldParseBody(contentType)) {
    await next();
    return;
  }

  try {
    const body = getRequestBody(req);
    if (body === undefined) {
      await next();
      return;
    }

    // Check body size limit
    const maxBodySize = Env.getInt('REQUEST_MAX_BODY_SIZE', 1024 * 1024); // 1MB default
    const bodySize = typeof body === 'string' ? Buffer.byteLength(body) : body.length;

    if (bodySize > maxBodySize) {
      // Don't parse oversized bodies, let next middleware handle error
      await next();
      return;
    }

    // Parse body based on content-type
    const parseResult = BodyParsers.parse(contentType, body);

    if (parseResult.ok && parseResult.data !== undefined) {
      // Update request body with parsed data
      req.setBody(parseResult.data);

      if (Env.getBool('ZIN_DEBUG_BODY_PARSING', false)) {
        Logger.debug('[Body Parser] Successfully parsed body', {
          contentType,
          originalSize: bodySize,
          parsedType: typeof parseResult.data,
        });
      }
    } else if (Env.getBool('ZIN_DEBUG_BODY_PARSING', false)) {
      Logger.warn('[Body Parser] Failed to parse body', {
        contentType,
        error: parseResult.error,
      });
      // Keep original body on parse failure
    }
  } catch (error) {
    Logger.error('[Body Parser] Unexpected error during body parsing', error);
    // Continue with original body
  }

  await next();
};

export default bodyParsingMiddleware;
