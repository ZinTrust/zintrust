/**
 * Server - HTTP Server implementation
 * Uses Node.js built-in HTTP server with no external dependencies
 */

import { Application } from '@/Application';
import { appConfig } from '@config/app';
import { Logger } from '@config/logger';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

export class Server {
  private readonly app: Application;
  private readonly server: http.Server;
  private readonly port: number;
  private readonly host: string;

  private readonly mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm',
  };

  constructor(app: Application, port?: number, host?: string) {
    this.app = app;
    // Support constructor parameters or use config defaults
    this.port = port ?? appConfig.port;
    this.host = host ?? appConfig.host;

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Security Headers
    res.setHeader('X-Powered-By', 'ZinTrust');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';"
    );

    try {
      const request = new Request(req);
      const response = new Response(res);

      // Route the request
      const router = this.app.getRouter();
      const route = router.match(request.getMethod(), request.getPath());

      if (route) {
        // Handler found, execute route handler
        await route.handler(request, response);
      } else {
        // Try serving static files from docs-website
        if (await this.serveStatic(request, response)) {
          return;
        }

        // 404 Not Found
        response.setStatus(404).json({ message: 'Not Found' });
      }
    } catch (error) {
      Logger.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Internal Server Error' }));
    }
  }

  /**
   * Serve static files from docs-website
   */
  private async serveStatic(request: Request, response: Response): Promise<boolean> {
    const urlPath = request.getPath();
    let filePath = this.mapStaticPath(urlPath);

    if (!filePath) return false;

    try {
      // If it's a directory, look for index.html
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (fs.existsSync(filePath)) {
        this.sendStaticFile(filePath, response);
        return true;
      }
    } catch (error) {
      Logger.error(`Error serving static file ${filePath}:`, error);
    }

    return false;
  }

  /**
   * Map URL path to physical file path
   */
  private mapStaticPath(urlPath: string): string {
    if (urlPath.startsWith('/doc/react')) {
      const subPath = urlPath.replace('/doc/react', '') || '/index.html';
      return path.join(process.cwd(), 'docs-website/react/out', subPath);
    }

    if (urlPath.startsWith('/doc/vue')) {
      const subPath = urlPath.replace('/doc/vue', '') || '/index.html';
      return path.join(process.cwd(), 'docs-website/vue/.vitepress/dist', subPath);
    }

    if (urlPath === '/' || urlPath === '/index.html') {
      return path.join(process.cwd(), 'docs-website/index.html');
    }

    if (urlPath.startsWith('/react/') || urlPath.startsWith('/vue/')) {
      return path.join(process.cwd(), 'docs-website', urlPath);
    }

    return '';
  }

  /**
   * Send static file to response
   */
  private sendStaticFile(filePath: string, response: Response): void {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = this.mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    response.setStatus(200);
    response.setHeader('Content-Type', contentType);
    response.send(content);
  }

  /**
   * Start the server
   */
  public listen(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        Logger.info(`Zintrust server running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Close the server
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        Logger.info('Zintrust server stopped');
        resolve();
      });
    });
  }

  /**
   * Get the underlying HTTP server instance
   */
  public getHttpServer(): http.Server {
    return this.server;
  }
}
