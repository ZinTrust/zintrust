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
  | { ok: true; bytes: Buffer; text?: string }
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

const shouldStoreRawText = (contentType: string): boolean => {
  if (contentType.includes('application/json')) return true;
  if (contentType.includes('application/x-www-form-urlencoded')) return true;
  if (contentType.startsWith('text/')) return true;
  if (contentType.includes('application/xml')) return true;
  return false;
};

const getTextFromRaw = (rawResult: ReadBodyResult & { ok: true }): string => {
  if (typeof rawResult.text === 'string') return rawResult.text;
  return rawResult.bytes.toString('utf-8');
};

const convertExistingToRawResult = (
  existingBytes: unknown,
  existingText: unknown
): ReadBodyResult & { ok: true } => {
  if (Buffer.isBuffer(existingBytes)) {
    return { ok: true, bytes: existingBytes };
  }

  if (typeof existingText === 'string') {
    return { ok: true, bytes: Buffer.from(existingText, 'utf-8'), text: existingText };
  }

  // Should be unreachable (guarded by `hasExisting`), but keep a safe fallback.
  return { ok: true, bytes: Buffer.from('', 'utf-8'), text: '' };
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

/**
 * Attempt to recover a JSON string that was stored as raw text or bytes
 * due to a missing or incorrect Content-Type header.
 *
 * Only plain objects `{...}` are considered for recovery — arrays, strings,
 * and primitives are left unchanged. This minimizes false positives for
 * legitimate text or binary payloads that happen to start with `{`.
 */
const tryRecoverTextJsonBody = (body: string): string | Record<string, unknown> => {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON — leave original unchanged
    }
  }
  return body;
};

const setRequestBody = (
  req: IRequest,
  rawResult: ReadBodyResult & { ok: true },
  contentType: string
): void => {
  const isUrlEncoded = contentType.includes('application/x-www-form-urlencoded');
  const isText = contentType.startsWith('text/') || contentType.includes('application/xml');
  const text = getTextFromRaw(rawResult);

  if (isUrlEncoded) {
    req.setBody(parseUrlEncodedBody(text));
  } else if (isText) {
    // Recovery: JSON body sent with text Content-Type (e.g. text/plain)
    // is stored as a raw string. Detect a JSON object and parse it.
    req.setBody(tryRecoverTextJsonBody(text));
  } else if (contentType !== '') {
    // Recovery: JSON body sent with an unknown Content-Type is stored as
    // raw bytes. Try to decode as text and check for JSON.
    const decoded = text.trim();
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      try {
        const parsed: unknown = JSON.parse(decoded);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          req.setBody(parsed);
          return;
        }
      } catch {
        // Not valid JSON — fall through to bytes
      }
    }
    req.setBody(rawResult.bytes);
  }
};

const applyParsedRequestBody = (
  req: IRequest,
  res: IResponse,
  rawResult: ReadBodyResult & { ok: true },
  contentType: string
): boolean => {
  if (contentType.includes('application/json')) {
    const parsed = parseJsonBody(getTextFromRaw(rawResult), contentType, res);
    if (parsed === null && res.getStatus() === 400) {
      return false;
    }

    req.setBody(parsed);
    return true;
  }

  setRequestBody(req, rawResult, contentType);
  return true;
};

const getMaxBodySize = (contentType: string): number => {
  const isJson = contentType.includes('application/json');
  const maxJsonSize = Env.getInt('MAX_JSON_SIZE', 1024 * 1024);
  return isJson ? maxJsonSize : Env.MAX_BODY_SIZE;
};

const reuseExistingRawBody = (
  req: IRequest,
  res: IResponse,
  contentType: string,
  existingBytes: unknown,
  existingText: unknown
): boolean => {
  const rawResult = convertExistingToRawResult(existingBytes, existingText);

  req.context['rawBodyBytes'] = rawResult.bytes;
  if (shouldStoreRawText(contentType)) {
    req.context['rawBodyText'] = getTextFromRaw(rawResult);
  } else {
    req.context['rawBodyText'] = undefined;
  }

  return applyParsedRequestBody(req, res, rawResult, contentType);
};

/**
 * Attempt to parse a string as a JSON object.
 * Returns the parsed object on success, or null if the string is not
 * a valid JSON object literal (plain object `{...}`, not array or primitive).
 */
const tryParseJsonObject = (text: string): Record<string, unknown> | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON
  }
  return null;
};

/**
 * Parse URL-encoded form data into a key-value record.
 * Multiple values for the same key are collected into an array.
 */
const parseUrlEncodedParams = (text: string): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {};
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    const existing = out[key];
    if (existing === undefined) {
      out[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      out[key] = [existing, value];
    }
  }
  return out;
};

/**
 * Detect and recover from a degenerate case where a JSON payload was sent
 * with a url-encoded Content-Type header. URLSearchParams treats the entire
 * JSON string as a single key with an empty value, so we try parsing that key.
 */
const tryRecoverDegenerateJson = (
  out: Record<string, string | string[]>
): Record<string, string | string[]> | null => {
  const keys = Object.keys(out);
  if (keys.length !== 1 || out[keys[0]] !== '') return null;
  const maybeJson = keys[0].trim();
  const parsed = tryParseJsonObject(maybeJson);
  if (parsed !== null) {
    return parsed as Record<string, string | string[]>;
  }
  return null;
};

const parseUrlEncodedBody = (text: string): Record<string, string | string[]> => {
  // JSON-first recovery: parse raw text before URLSearchParams touches it.
  // URLSearchParams splits on the first '=' (corrupting base64-padded values)
  // and converts '+' to spaces, making encrypted/base64 fields unrecoverable.
  const jsonResult = tryParseJsonObject(text);
  if (jsonResult !== null) {
    return jsonResult as Record<string, string | string[]>;
  }

  const out = parseUrlEncodedParams(text);

  // Recovery: if a JSON payload is sent with the wrong Content-Type header
  // (e.g. application/x-www-form-urlencoded instead of application/json),
  // URLSearchParams will treat the entire JSON string as a single key with
  // an empty value. Detect this degenerate case and fall back to JSON.parse.
  const recovered = tryRecoverDegenerateJson(out);
  if (recovered !== null) {
    return recovered;
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
  if (shouldStoreRawText(contentType)) {
    req.context['rawBodyText'] = getTextFromRaw(rawResult);
  } else {
    req.context['rawBodyText'] = undefined;
  }

  // Parse and set body based on content type
  try {
    if (!applyParsedRequestBody(req, res, rawResult, contentType)) {
      return false;
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
  const maxBytes = getMaxBodySize(contentType);

  // Read or reuse raw body
  if (hasExisting) {
    if (!reuseExistingRawBody(req, res, contentType, existingBytes, existingText)) {
      return;
    }
  } else {
    await processBodyParsing(req, res, contentType, maxBytes);
  }

  await next();
};

export default bodyParsingMiddleware;
