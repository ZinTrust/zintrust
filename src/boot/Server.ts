/**
 * Server - HTTP Server implementation
 * Uses Node.js built-in HTTP server with no external dependencies
 */

import { IApplication } from '@boot/Application';
import { esmDirname } from '@common/index';
import { appConfig } from '@config/app';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { IRequest, Request } from '@http/Request';
import { IResponse, Response } from '@http/Response';
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

/**
 * Handle incoming HTTP requests
 */
const handleRequest = async (
  app: IApplication,
  req: http.IncomingMessage | null,
  res: http.ServerResponse
): Promise<void> => {
  try {
    // Use the raw URL so docs assets (/doc/assets/...) get the correct CSP.
    const requestPath = typeof req?.url === 'string' ? req.url : '/';
    setSecurityHeaders(res, requestPath);

    if (!req) {
      throw ErrorFactory.createConnectionError('Request object is missing');
    }

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

    const sockets = new Set<Socket>();
    httpServer.on('connection', (socket: Socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });

    return {
      async listen(): Promise<void> {
        return new Promise((resolve) => {
          httpServer.listen(serverPort, serverHost, () => {
            Logger.info(`Zintrust server running at http://${serverHost}:${serverPort}`);
            Logger.info(`Zintrust documentation at http://${serverHost}:${serverPort}/doc`);
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
