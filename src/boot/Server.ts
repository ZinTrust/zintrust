/**
 * Server - HTTP Server implementation
 * Uses Node.js built-in HTTP server with no external dependencies
 */

import { IApplication } from '@boot/Application';
import { appConfig } from '@config/app';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { IRequest, Request } from '@http/Request';
import { IResponse, Response } from '@http/Response';
import * as fs from '@node-singletons/fs';
import * as http from '@node-singletons/http';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
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
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const packageRoot = findPackageRoot(thisDir);

  // Primary: framework ships built docs assets in dist/public
  const roots: string[] = [path.join(packageRoot, 'dist/public')];

  // Secondary: when running framework from source tree
  roots.push(path.join(packageRoot, 'docs-website/public'));

  return roots;
};

const getDocsPublicRoot = (): string => {
  const isProduction = process.env.NODE_ENV === 'production';

  // First try app-local roots (developer app override), then fall back to framework-shipped assets.
  const appRoots = isProduction
    ? [path.join(process.cwd(), 'dist/public')]
    : [path.join(process.cwd(), 'docs-website/public')];

  const candidates = [...appRoots, ...getFrameworkPublicRoots()];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback: preserve previous behavior even if missing on disk.
  return appRoots[0] ?? path.join(process.cwd(), 'dist/public');
};

const stripLeadingSlashes = (value: string): string => value.replace(/^\/+/, '');

/**
 * Map URL path to physical file path
 */
const mapStaticPath = (urlPath: string): string => {
  const publicRoot = getDocsPublicRoot();

  if (urlPath === '/' || urlPath === '/index.html') {
    return path.join(publicRoot, 'index.html');
  }

  if (urlPath.startsWith('/doc')) {
    const rest = stripLeadingSlashes(urlPath.slice('/doc'.length));
    // /doc -> <publicRoot>/doc, /doc/foo -> <publicRoot>/doc/foo
    return rest === '' ? path.join(publicRoot) : path.join(publicRoot, rest);
  }

  if (urlPath.startsWith('/assets')) {
    const rest = stripLeadingSlashes(urlPath.slice('/assets'.length));
    // /assets -> <publicRoot>/assets, /assets/foo -> <publicRoot>/assets/foo
    return rest === '' ? path.join(publicRoot, 'assets') : path.join(publicRoot, 'assets', rest);
  }

  if (urlPath.startsWith('/vp-icons.css')) {
    // /vp-icons.css -> <publicRoot>/vp-icons.css
    return path.join(publicRoot, 'vp-icons.css');
  }

  if (urlPath.startsWith('/hashmap.json')) {
    // hashmap.json -> <publicRoot>hashmap.json
    return path.join(publicRoot, 'hashmap.json');
  }

  // Allow serving a small set of root docs assets.
  if (
    urlPath === '/404.html' ||
    urlPath === '/_headers' ||
    urlPath === '/zintrust.svg' ||
    urlPath.startsWith('/brand/')
  ) {
    return path.join(publicRoot, stripLeadingSlashes(urlPath));
  }

  return '';
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

  // Canonicalize docs base path (VitePress expects trailing slash for correct relative resolution)
  if (urlPath === '/doc') {
    response.setStatus(302);
    response.setHeader('Location', '/doc/');
    response.send('');
    return true;
  }

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
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "script-src-elem 'self' 'unsafe-inline'; " +
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

/**
 * Handle incoming HTTP requests
 */
const handleRequest = async (
  app: IApplication,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  // Use the raw URL so docs assets (/doc/assets/...) get the correct CSP.
  const requestPath = typeof req.url === 'string' ? req.url : '/';
  setSecurityHeaders(res, requestPath);

  try {
    const request = Request.create(req);
    const response = Response.create(res);

    // Route the request
    const router = app.getRouter();
    const route = Router.match(router, request.getMethod(), request.getPath());

    if (route === null) {
      // Try serving static files from docs-website
      if (await serveStatic(request, response)) {
        return;
      }

      // 404 Not Found
      response.setStatus(404).json({ message: 'Not Found' });
    } else {
      // Handler found, execute route handler
      request.setParams(route.params);
      await route.handler(request, response);
    }
  } catch (error) {
    ErrorFactory.createTryCatchError('Server error:', error);
    res.writeHead(500, { [HTTP_HEADERS.CONTENT_TYPE]: MIME_TYPES.JSON });
    res.end(JSON.stringify({ message: 'Internal Server Error' }));
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
  create(app: IApplication, port?: number, host?: string): IServer {
    const serverPort = port ?? appConfig.port;
    const serverHost = host ?? appConfig.host;

    const httpServer = http.createServer(
      async (req: http.IncomingMessage, res: http.ServerResponse) => handleRequest(app, req, res)
    );

    return {
      async listen(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.listen(serverPort, serverHost, () => {
            Logger.info(`Zintrust server running at http://${serverHost}:${serverPort}`);
            resolve();
          });
        });
      },
      async close(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.close(() => {
            Logger.info('Zintrust server stopped');
            resolve();
          });
        });
      },
      getHttpServer(): http.Server {
        return httpServer;
      },
    };
  },
});

export default Server;
