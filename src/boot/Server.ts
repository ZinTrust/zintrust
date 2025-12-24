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
import { Router } from '@routing/Router';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

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

/**
 * Map URL path to physical file path
 */
const mapStaticPath = (urlPath: string): string => {
  if (urlPath.startsWith('/doc')) {
    const subPath = urlPath.replace('/doc', '') || '/index.html';
    return path.join(process.cwd(), 'docs-website/vue/.vitepress/dist', subPath);
  }

  if (urlPath === '/' || urlPath === '/index.html') {
    return path.join(process.cwd(), 'docs-website/index.html');
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
const setSecurityHeaders = (res: http.ServerResponse): void => {
  res.setHeader(HTTP_HEADERS.X_POWERED_BY, 'ZinTrust');
  res.setHeader(HTTP_HEADERS.X_CONTENT_TYPE_OPTIONS, 'nosniff');
  res.setHeader(HTTP_HEADERS.X_FRAME_OPTIONS, 'DENY');
  res.setHeader(HTTP_HEADERS.X_XSS_PROTECTION, '1; mode=block');
  res.setHeader(HTTP_HEADERS.REFERRER_POLICY, 'strict-origin-when-cross-origin');
  res.setHeader(
    HTTP_HEADERS.CONTENT_SECURITY_POLICY,
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';"
  );
};

/**
 * Handle incoming HTTP requests
 */
const handleRequest = async (
  app: IApplication,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  setSecurityHeaders(res);

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
