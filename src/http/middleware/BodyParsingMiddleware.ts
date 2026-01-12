/**
 * Content Type Detection & Body Parsing Middleware
 * Detects content-type and parses non-JSON request bodies
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { MultipartParser } from '@http/parsers/MultipartParser';
import type { Middleware } from '@middleware/MiddlewareStack';

type ReadBodyResult =
  | { ok: true; bytes: Buffer; text: string }
  | { ok: false; statusCode: 400 | 413; message: string };

/**
 * Get content-type from request headers
 */
const getContentType = (req: IRequest): string => {
  const contentType = req.getHeader('content-type');
  if (typeof contentType === 'string') return contentType.split(';')[0].toLowerCase().trim();
  if (Array.isArray(contentType) && typeof contentType[0] === 'string') {
    return contentType[0].split(';')[0].toLowerCase().trim();
  }
  return '';
};

const shouldReadRequestBody = (req: IRequest): boolean => {
  const method = (req.getMethod?.() ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  return true;
};

const toBuffer = (chunk: unknown): Buffer => {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk);
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  if (chunk instanceof ArrayBuffer) return Buffer.from(new Uint8Array(chunk));
  return Buffer.from(String(chunk));
};

const validateSize = (bytes: Buffer, maxBytes: number): ReadBodyResult | null => {
  if (bytes.length > maxBytes) {
    return { ok: false, statusCode: 413, message: 'Payload Too Large' };
  }
  return null;
};

const handleMockedStringBody = (body: string, maxBytes: number): ReadBodyResult | null => {
  const bytes = Buffer.from(body);
  const sizeError = validateSize(bytes, maxBytes);
  if (sizeError) return sizeError;
  return { ok: true, bytes, text: body };
};

const handleMockedBufferBody = (body: Buffer, maxBytes: number): ReadBodyResult | null => {
  const sizeError = validateSize(body, maxBytes);
  if (sizeError) return sizeError;
  return { ok: true, bytes: body, text: body.toString('utf-8') };
};

const handleMockedObjectBody = (body: object, maxBytes: number): ReadBodyResult | null => {
  try {
    const text = JSON.stringify(body);
    const bytes = Buffer.from(text, 'utf-8');
    const sizeError = validateSize(bytes, maxBytes);
    if (sizeError) return sizeError;
    return { ok: true, bytes, text };
  } catch {
    return { ok: false, statusCode: 400, message: 'Invalid request body' };
  }
};

const handleMockedBody = (mockedBody: unknown, maxBytes: number): ReadBodyResult | null => {
  if (typeof mockedBody === 'string') {
    return handleMockedStringBody(mockedBody, maxBytes);
  }
  if (Buffer.isBuffer(mockedBody)) {
    return handleMockedBufferBody(mockedBody, maxBytes);
  }
  if (typeof mockedBody === 'object' && mockedBody !== null) {
    return handleMockedObjectBody(mockedBody, maxBytes);
  }
  return null;
};

const readStreamBody = async (raw: unknown, maxBytes: number): Promise<ReadBodyResult> => {
  const chunks: Buffer[] = [];
  let totalSize = 0;

  try {
    for await (const chunk of raw as AsyncIterable<unknown>) {
      const buf = toBuffer(chunk);
      totalSize += buf.length;

      if (totalSize > maxBytes) {
        try {
          (raw as { destroy?: () => void }).destroy?.();
        } catch {
          // best-effort
        }
        return { ok: false, statusCode: 413, message: 'Payload Too Large' };
      }

      chunks.push(buf);
    }
  } catch {
    return { ok: false, statusCode: 400, message: 'Invalid request body' };
  }

  if (chunks.length === 0) return { ok: true, bytes: Buffer.from(''), text: '' };
  const bytes = Buffer.concat(chunks);
  return { ok: true, bytes, text: bytes.toString('utf-8') };
};

const readRawBody = async (req: IRequest, maxBytes: number): Promise<ReadBodyResult> => {
  const raw = req.getRaw();

  // Support tests/mocks that stuff a body directly on the raw request.
  const mockedBody = (raw as unknown as { body?: unknown }).body;
  const mockedResult = handleMockedBody(mockedBody, maxBytes);
  if (mockedResult) {
    return mockedResult;
  }

  // Read from actual stream
  return readStreamBody(raw, maxBytes);
};

const convertExistingToRawResult = (
  existingBytes: unknown,
  existingText: unknown
): ReadBodyResult => {
  let bytes: Buffer;
  let text: string;

  if (Buffer.isBuffer(existingBytes)) {
    bytes = existingBytes;
    text = existingBytes.toString('utf-8');
  } else if (typeof existingText === 'string') {
    text = existingText;
    bytes = Buffer.from(existingText, 'utf-8');
  } else {
    const fallback = String(existingText ?? '');
    bytes = Buffer.from(fallback, 'utf-8');
    text = fallback;
  }

  return { ok: true, bytes, text };
};

const parseJsonBody = (text: string, contentType: string, res: IResponse): unknown => {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown);
  } catch {
    Logger.debug('[Body Parser] Invalid JSON body', {
      contentType,
      byteLength: Buffer.byteLength(text),
      rawBodyPreview: text.slice(0, 256),
    });
    res.setStatus(400).json({ error: 'Invalid JSON body' });
    return null;
  }
};

const setRequestBody = (
  req: IRequest,
  rawResult: ReadBodyResult & { ok: true },
  contentType: string
): void => {
  const isJson = contentType.includes('application/json');
  const isUrlEncoded = contentType.includes('application/x-www-form-urlencoded');
  const isText = contentType.startsWith('text/') || contentType.includes('application/xml');

  if (isJson) {
    const parsed = parseJsonBody(rawResult.text, contentType, {} as IResponse);
    if (parsed !== null) {
      req.setBody(parsed);
    }
  } else if (isUrlEncoded) {
    req.setBody(parseUrlEncodedBody(rawResult.text));
  } else if (isText) {
    req.setBody(rawResult.text);
  } else if (contentType !== '') {
    req.setBody(rawResult.bytes);
  }
};

const parseUrlEncodedBody = (text: string): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(existing)) {
      existing.push(value);
      continue;
    }
    out[key] = [existing, value];
  }
  return out;
};

const processBodyParsing = async (
  req: IRequest,
  res: IResponse,
  contentType: string,
  maxBytes: number
): Promise<boolean> => {
  const rawResult: ReadBodyResult = await readRawBody(req, maxBytes);

  if (rawResult.ok === false) {
    res.setStatus(rawResult.statusCode).json({ error: rawResult.message });
    return false;
  }

  // Store raw body for downstream consumers
  req.context['rawBodyBytes'] = rawResult.bytes;
  req.context['rawBodyText'] = rawResult.text;

  // Parse and set body based on content type
  try {
    const isJson = contentType.includes('application/json');
    if (isJson) {
      const parsed = parseJsonBody(rawResult.text, contentType, res);
      if (parsed === null && res.getStatus() === 400) {
        return false; // JSON parsing failed, response already sent
      }
      req.setBody(parsed);
    } else {
      setRequestBody(req, rawResult, contentType);
    }

    if (Env.getBool('ZIN_DEBUG_BODY_PARSING', false)) {
      Logger.debug('[Body Parser] Parsed request body', {
        contentType,
        byteLength: rawResult.bytes.length,
        parsedType: typeof req.getBody?.(),
      });
    }
  } catch (error) {
    Logger.error('[Body Parser] Unexpected error during body parsing', error);
  }

  return true;
};

/**
 * Body parsing middleware
 * Automatically detects content-type and parses non-JSON bodies
 */
export const bodyParsingMiddleware: Middleware = async (
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
): Promise<void> => {
  const contentType = getContentType(req);

  // Early exit if body already set
  const existingBody = req.getBody?.();
  if (existingBody !== null && existingBody !== undefined) {
    await next();
    return;
  }

  // Early exit for multipart (handled by upload middleware)
  if (MultipartParser.isMultipart(contentType)) {
    await next();
    return;
  }

  // Early exit for methods that don't have bodies
  if (!shouldReadRequestBody(req)) {
    await next();
    return;
  }

  // Determine if we have existing raw body from adapter
  const existingBytes = req.context['rawBodyBytes'];
  const existingText = req.context['rawBodyText'];
  const hasExisting = Buffer.isBuffer(existingBytes) || typeof existingText === 'string';

  // Calculate size limit based on content type
  const isJson = contentType.includes('application/json');
  const maxJsonSize = Env.getInt('MAX_JSON_SIZE', 1024 * 1024);
  const maxBytes = isJson ? maxJsonSize : Env.MAX_BODY_SIZE;

  // Read or reuse raw body
  if (hasExisting) {
    const rawResult = convertExistingToRawResult(existingBytes, existingText);
    if (rawResult.ok) {
      req.context['rawBodyBytes'] = rawResult.bytes;
      req.context['rawBodyText'] = rawResult.text;
    }
  } else {
    await processBodyParsing(req, res, contentType, maxBytes);
  }

  await next();
};

export default bodyParsingMiddleware;
