/**
 * File Upload Middleware
 * Processes multipart/form-data requests and makes files available on request
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { MultipartParser } from '@http/parsers/MultipartParser';
import { MultipartParserRegistry } from '@http/parsers/MultipartParserRegistry';
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
 * File upload middleware
 * Automatically parses multipart/form-data and makes files available
 */
export const fileUploadMiddleware: Middleware = async (
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const contentType = getContentType(req);

  // Only process multipart/form-data requests
  if (!MultipartParser.isMultipart(contentType)) {
    await next();
    return;
  }

  // Phase 4 default behavior: multipart requires external streaming parser.
  const provider = MultipartParserRegistry.get();
  if (provider === null) {
    res.setStatus(415).json({
      error: 'multipart/form-data not supported. Install @zintrust/storage to enable uploads.',
    });
    return;
  }

  try {
    const maxFileSizeBytes = Env.getInt('MAX_FILE_SIZE', 50 * 1024 * 1024);
    const maxFiles = Env.getInt('MAX_FILES', 20);
    const maxFields = Env.getInt('MAX_FIELDS', 200);
    const maxFieldSizeBytes = Env.getInt('MAX_FIELD_SIZE', 128 * 1024);

    const parsed = await provider({
      req: req.getRaw(),
      contentType,
      limits: {
        maxFileSizeBytes,
        maxFiles,
        maxFields,
        maxFieldSizeBytes,
      },
    });

    const currentBody = req.getBody?.();
    const updatedBody = typeof currentBody === 'object' && currentBody !== null ? currentBody : {};

    // Merge fields directly into the request body for ergonomics.
    // Files remain under __files for FileUpload helper compatibility.
    req.setBody({
      ...updatedBody,
      ...parsed.fields,
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
