/**
 * Server - HTTP Server implementation
 * Uses Node.js built-in HTTP server with no external dependencies
 */

import { IApplication } from '@boot/Application';
import { esmDirname } from '@common/index';
import { appConfig } from '@config/app';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory, initZintrustError, type IZintrustError } from '@exceptions/ZintrustError';
import type { IKernel } from '@http/Kernel';
import { Kernel } from '@http/Kernel';
import { IRequest, Request } from '@http/Request';
import { IResponse, Response } from '@http/Response';
import { ErrorPageRenderer } from '@http/error-pages/ErrorPageRenderer';
import * as fs from '@node-singletons/fs';
import * as http from '@node-singletons/http';
import type { Socket } from '@node-singletons/net';
import * as path from '@node-singletons/path';
import { Router } from '@routing/Router';

export interface IServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  getHttpServer(): http.Server;
}

const MIME_TYPES_MAP: Record<string, string> = {
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

const trySendHtmlErrorPage = (
  request: IRequest,
  response: IResponse,
  publicRoot: string,
  input: {
    statusCode: number;
    errorName: string;
    errorMessage: string;
    stackPretty?: string;
    stackRaw?: string;
    requestPretty?: string;
    requestRaw?: string;
  }
): boolean => {
  if (!ErrorPageRenderer.shouldSendHtml(request)) return false;

  const html = ErrorPageRenderer.renderHtml(publicRoot, {
    statusCode: input.statusCode,
    errorName: input.errorName,
    errorMessage: input.errorMessage,
    requestPath: request.getPath(),
    stackPretty: input.stackPretty,
    stackRaw: input.stackRaw,
    requestPretty: input.requestPretty,
    requestRaw: input.requestRaw,
  });

  if (html === undefined) return false;

  response.html(html);
  return true;
};

const redactHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const redacted = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (redacted.has(key.toLowerCase())) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = value;
  }
  return out;
};

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return '';
  }
};

const findPackageRoot = (startDir: string): string => {
  let current = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
};

const getFrameworkPublicRoots = (): string[] => {
  const thisDir = esmDirname(import.meta.url);
  const packageRoot = findPackageRoot(thisDir);
  return [
    path.join(packageRoot, 'dist/public'),
    path.join(packageRoot, 'public'), // Fallback for shipped package
  ];
};

const getDocsPublicRoot = (): string => {
  // First try app-local roots (developer app override), then fall back to framework-shipped assets.
  const appRoots = [path.join(process.cwd(), 'public')];
  const candidates = [...appRoots, ...getFrameworkPublicRoots()];
  const hasDocsEntrypoint = (root: string): boolean => {
    const directIndex = path.join(root, 'index.html');
    return fs.existsSync(directIndex);
  };
  // Prefer a root that actually contains docs assets.
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && hasDocsEntrypoint(candidate)) return candidate;
  }
  // Fall back to the first existing directory.
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
};

/**
 * Map URL path to physical file path
 */
const mapStaticPath = (urlPath: string): string => {
  const publicRoot = getDocsPublicRoot();

  const normalize = (p: string): string => (p.startsWith('/') ? p.slice(1) : p);

  // /doc acts as a mount for the docs/static site.
  if (urlPath === '/doc' || urlPath === '/doc/') return publicRoot;
  if (urlPath.startsWith('/doc/'))
    return path.join(publicRoot, normalize(urlPath.slice('/doc/'.length)));

  // Also serve app-local static files from the same public root.
  return path.join(publicRoot, normalize(urlPath));
};

/**
 * Send static file to response
 */
const sendStaticFile = (filePath: string, response: IResponse): void => {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES_MAP[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);

  response.setStatus(200);
  response.setHeader('Content-Type', contentType);
  response.send(content);
};

/**
 * Serve static files from docs-website
 */
// eslint-disable-next-line @typescript-eslint/require-await
const serveStatic = async (request: IRequest, response: IResponse): Promise<boolean> => {
  const urlPath = request.getPath();

  let filePath = mapStaticPath(urlPath);

  if (!filePath) return false;

  try {
    // If it's a directory, look for index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    // Handle clean URLs (try adding .html)
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      const htmlPath = `${filePath}.html`;
      if (fs.existsSync(htmlPath)) {
        filePath = htmlPath;
      }
    }

    if (fs.existsSync(filePath)) {
      sendStaticFile(filePath, response);
      return true;
    }
  } catch (error) {
    ErrorFactory.createTryCatchError(`Error serving static file ${filePath}`, error);
  }

  return false;
};

/**
 * Set security headers on response
 */
const getContentSecurityPolicyForPath = (requestPath: string): string => {
  // Default CSP for the API/framework.
  const baseCsp =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self';";

  // Docs pages intentionally load external assets (Tailwind CDN + Google Fonts).
  // Keep this relaxation scoped to the docs base path.
  if (!requestPath.startsWith('/doc')) return baseCsp;

  return (
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; " +
    "script-src-elem 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data: https://fonts.gstatic.com;"
  );
};

const setSecurityHeaders = (res: http.ServerResponse, requestPath: string): void => {
  res.setHeader(HTTP_HEADERS.X_POWERED_BY, 'ZinTrust');
  res.setHeader(HTTP_HEADERS.X_CONTENT_TYPE_OPTIONS, 'nosniff');
  res.setHeader(HTTP_HEADERS.X_FRAME_OPTIONS, 'DENY');
  res.setHeader(HTTP_HEADERS.X_XSS_PROTECTION, '1; mode=block');
  res.setHeader(HTTP_HEADERS.REFERRER_POLICY, 'strict-origin-when-cross-origin');
  res.setHeader(HTTP_HEADERS.CONTENT_SECURITY_POLICY, getContentSecurityPolicyForPath(requestPath));
};

const getContentType = (req: http.IncomingMessage): string => {
  const value = req.headers['content-type'];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

const shouldReadRequestBody = (req: http.IncomingMessage): boolean => {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  return true;
};

const readRequestBodyBytes = async (req: http.IncomingMessage): Promise<Buffer | null> => {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const maxBodySize = Env.MAX_BODY_SIZE;

  // IncomingMessage is async-iterable in Node >= 10
  for await (const chunk of req as unknown as AsyncIterable<unknown>) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalSize += buf.length;
    if (totalSize > maxBodySize) {
      // Best-effort: stop reading and close the connection.
      try {
        req.destroy();
      } catch {
        // best-effort
      }

      // 413 isn't part of the standard ErrorFactory set, so initialize a typed ZinTrust error.
      const err = ErrorFactory.createGeneralError('Payload Too Large');
      initZintrustError(err, {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        name: 'PayloadTooLargeError',
        details: { maxBodySize, totalSize },
        captureStackTraceCtor: readRequestBodyBytes,
      });
      throw err;
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) return null;
  return Buffer.concat(chunks);
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

const tryReadAndSetParsedBody = async (
  request: IRequest,
  response: IResponse
): Promise<boolean> => {
  const rawReq = request.getRaw();
  Logger.debug(`[BodyParse] Method=${rawReq.method} Path=${rawReq.url}`);
  if (!shouldReadRequestBody(rawReq)) {
    Logger.debug('[BodyParse] Skipping body read (GET/HEAD/OPTIONS)');
    return true;
  }

  const bodyBytes = await readRequestBodyBytes(rawReq);
  Logger.debug(`[BodyParse] Read ${bodyBytes?.length ?? 0} bytes`);
  if (bodyBytes === null) return true;

  const contentType = getContentType(rawReq);
  const text = bodyBytes.toString('utf-8');

  // Keep raw body available for advanced middleware (e.g., signing)
  request.context['rawBodyBytes'] = bodyBytes;
  request.context['rawBodyText'] = text;

  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(text) as unknown;
      request.setBody(parsed);

      const keys =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? Object.keys(parsed as Record<string, unknown>)
          : [];

      Logger.debug(`[BodyParse] JSON parsed, keys: ${keys.join(',')}`);
      return true;
    } catch (err) {
      Logger.warn(`[BodyParse] JSON parse failed: ${(err as Error).message}`);
      response.setStatus(400).json({ error: 'Invalid JSON body' });
      return false;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    request.setBody(parseUrlEncodedBody(text));
    return true;
  }

  // Fallback: preserve as string (Request.body will be `{}` but getBody() will contain the raw string)
  request.setBody(text);
  return true;
};

/**
 * Handle incoming HTTP requests
 */
const getRequestPathFromRawRequest = (req: http.IncomingMessage | null): string =>
  typeof req?.url === 'string' ? req.url : '/';

const handleNotFound = async (request: IRequest, response: IResponse): Promise<void> => {
  // Try serving static files from docs-website
  if (await serveStatic(request, response)) return;

  // 404 Not Found
  response.setStatus(404);

  const publicRoot = getDocsPublicRoot();
  if (
    trySendHtmlErrorPage(request, response, publicRoot, {
      statusCode: 404,
      errorName: 'Not Found',
      errorMessage: 'The page you requested could not be found.',
    })
  ) {
    return;
  }

  response.json({ message: 'Not Found' });
};

const handleInternalServerErrorWithWrappers = (
  request: IRequest,
  response: IResponse,
  error?: unknown
): void => {
  response.setStatus(500);

  const isDev = appConfig.isDevelopment();
  const err =
    error instanceof Error ? error : ErrorFactory.createGeneralError('Unknown error', error);

  const errorName = isDev ? err.name || 'Error' : 'Internal Server Error';
  const errorMessage = isDev
    ? err.message || 'An error has occurred'
    : 'Something went wrong while handling your request.';

  const requestObj = isDev
    ? {
        method: request.getMethod(),
        path: request.getPath(),
        query: request.getQuery(),
        headers: redactHeaders(request.getHeaders() as unknown as Record<string, unknown>),
      }
    : undefined;

  const requestPretty =
    requestObj === undefined
      ? undefined
      : `Request\n\nMethod: ${requestObj.method}\nPath: ${requestObj.path}\n\nHeaders:\n${safeJsonStringify(
          requestObj.headers
        )}\n\nQuery:\n${safeJsonStringify(requestObj.query)}`;

  const requestRaw = requestObj === undefined ? undefined : safeJsonStringify(requestObj);

  const stackPretty = isDev ? (err.stack ?? '') : undefined;
  const stackRaw = isDev
    ? safeJsonStringify({ name: err.name, message: err.message, stack: err.stack })
    : undefined;

  const publicRoot = getDocsPublicRoot();
  if (
    trySendHtmlErrorPage(request, response, publicRoot, {
      statusCode: 500,
      errorName,
      errorMessage,
      stackPretty,
      stackRaw,
      requestPretty,
      requestRaw,
    })
  ) {
    return;
  }

  response.json({ message: 'Internal Server Error' });
};

const handleInternalServerErrorRaw = (res: http.ServerResponse): void => {
  res.writeHead(500, { [HTTP_HEADERS.CONTENT_TYPE]: MIME_TYPES.JSON });
  res.end(JSON.stringify({ message: 'Internal Server Error' }));
};

const handleRequest = async (
  params: { app: IApplication; getKernel: () => IKernel },
  req: http.IncomingMessage | null,
  res: http.ServerResponse
): Promise<void> => {
  let request: IRequest | undefined;
  let response: IResponse | undefined;

  try {
    // Use the raw URL so docs assets (/doc/assets/...) get the correct CSP.
    const requestPath = getRequestPathFromRawRequest(req);
    setSecurityHeaders(res, requestPath);

    if (!req) {
      throw ErrorFactory.createConnectionError('Request object is missing');
    }

    request = Request.create(req);
    response = Response.create(res);

    // Ensure middleware/controllers can read req.getBody()/req.body.
    // Without this, validation middleware cannot populate req.validated.body at runtime.
    Logger.debug(
      `[Server] Before body parse: req.getBody()=${request.getBody() === null ? 'null' : typeof request.getBody()}`
    );
    const parsedOk = await tryReadAndSetParsedBody(request, response);
    if (!parsedOk) return;

    // Dev-only: force a 500 error page for visual testing.
    if (appConfig.isDevelopment() && request.getPath() === '/test-500') {
      throw ErrorFactory.createGeneralError('Test 500 error page');
    }

    const router = params.app.getRouter();
    const route = Router.match(router, request.getMethod(), request.getPath());

    if (route === null) {
      await handleNotFound(request, response);
      return;
    }

    // CRITICAL: Delegate to Kernel to execute middleware pipeline before handler.
    // Note: body parsing must happen before validation middleware runs, so we keep
    // tryReadAndSetParsedBody(...) here in the Node server path.
    const kernel = params.getKernel();
    await kernel.handleRequest(request, response);
  } catch (error) {
    ErrorFactory.createTryCatchError('Server error:', error);

    // Handle oversized payloads explicitly.
    const maybeZintrust = error as Partial<IZintrustError> | undefined;
    if (response !== undefined && maybeZintrust?.statusCode === 413) {
      response.setStatus(413).json({ error: 'Payload Too Large' });
      return;
    }

    // If we already have wrappers, prefer using them.
    if (request !== undefined && response !== undefined) {
      handleInternalServerErrorWithWrappers(request, response, error);
      return;
    }

    handleInternalServerErrorRaw(res);
  }
};

/**
 * Server - HTTP Server implementation
 * Refactored to Functional Object pattern
 */
export const Server = Object.freeze({
  /**
   * Create a new server instance
   */
  create(app: IApplication, port?: number, host?: string, kernel: IKernel | null = null): IServer {
    const serverPort = port ?? appConfig.port;
    const serverHost = host ?? appConfig.host;

    let kernelInstance: IKernel | null = kernel;

    const getKernel = (): IKernel => {
      if (kernelInstance !== null) return kernelInstance;
      kernelInstance = Kernel.create(app.getRouter(), app.getContainer());
      return kernelInstance;
    };

    const httpServer = http.createServer(
      async (req: http.IncomingMessage, res: http.ServerResponse) =>
        handleRequest({ app, getKernel }, req, res)
    );

    const sockets = new Set<Socket>();
    httpServer.on('connection', (socket: Socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });

    return {
      async listen(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.listen(serverPort, serverHost, () => {
            resolve();
          });
        });
      },
      async close(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.close(() => {
            Logger.info('ZinTrust server stopped');
            resolve();
          });

          // Ensure keep-alive / hanging connections don't block shutdown
          for (const socket of sockets) {
            try {
              socket.destroy();
            } catch {
              // best-effort
            }
          }
        });
      },
      getHttpServer(): http.Server {
        return httpServer;
      },
    };
  },
});

export default Server;
