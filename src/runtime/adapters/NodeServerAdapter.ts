import { Env } from '@config/env';
import Logger from '@config/logger';
import {
  AdapterConfig,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

/**
 * Node.js HTTP Server adapter for standard containers and traditional servers
 * Uses Node.js built-in HTTP server for maximum compatibility
 */
export class NodeServerAdapter implements RuntimeAdapter {
  readonly platform = 'nodejs' as const;
  private readonly config: AdapterConfig;
  private readonly logger: AdapterConfig['logger'];
  private server?: Server;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.logger = config.logger || createDefaultLogger();
  }

  async handle(): Promise<PlatformResponse> {
    throw new Error(
      'Node.js adapter requires startServer() method. Use RuntimeDetector for automatic initialization.'
    );
  }

  /**
   * Start HTTP server for Node.js environments
   */
  async startServer(port: number = 3000, host: string = 'localhost'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.requestListener());

      this.server.listen(port, host, () => {
        this.logger?.info(`Node.js server listening on http://${host}:${port}`);
        resolve();
      });

      this.server.on('error', (error: Error) => {
        this.logger?.error('Server error', error);
        reject(error);
      });

      this.server.on('clientError', (error: Error, socket) => {
        if ((error as NodeJS.ErrnoException).code === 'ECONNRESET' || !socket.writable) {
          return;
        }
        this.logger?.warn(`Client error: ${error.message}`);
      });
    });
  }

  /**
   * Stop the HTTP server gracefully
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger?.info('Node.js server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  parseRequest(): PlatformRequest {
    throw new Error('Node.js adapter uses native Node.js HTTP');
  }

  formatResponse(): unknown {
    throw new Error('Node.js adapter uses native Node.js HTTP');
  }

  getLogger(): {
    debug(msg: string, data?: unknown): void;
    info(msg: string, data?: unknown): void;
    warn(msg: string, data?: unknown): void;
    error(msg: string, err?: Error): void;
  } {
    return (
      this.logger || {
        debug: (msg: string) => Logger.debug(`[Node.js] ${msg}`),
        info: (msg: string) => Logger.info(`[Node.js] ${msg}`),
        warn: (msg: string) => Logger.warn(`[Node.js] ${msg}`),
        error: (msg: string, err?: Error) => Logger.error(`[Node.js] ${msg}`, err?.message),
      }
    );
  }

  supportsPersistentConnections(): boolean {
    // Node.js servers support persistent connections
    return true;
  }

  getEnvironment(): {
    nodeEnv: string;
    runtime: string;
    dbConnection: string;
    dbHost?: string;
    dbPort?: number;
    [key: string]: unknown;
  } {
    return {
      nodeEnv: Env.NODE_ENV,
      runtime: 'nodejs',
      dbConnection: Env.DB_CONNECTION,
      dbHost: Env.DB_HOST,
      dbPort: Env.DB_PORT,
    };
  }

  private requestListener(): (req: IncomingMessage, res: ServerResponse) => void {
    return (req: IncomingMessage, res: ServerResponse): void => {
      void this.handleRequest(req, res);
    };
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    let body: Buffer | null = null;

    // Collect request body
    req.on('data', (chunk: Buffer) => {
      const maxSize = this.config.maxBodySize ?? 10 * 1024 * 1024;
      if (chunks.length * chunk.length > maxSize) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload Too Large' }));
        req.socket.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        body = chunks.length > 0 ? Buffer.concat(chunks) : null;

        // Set request timeout
        const timeout = this.config.timeout ?? 30000;
        const timeoutHandle = setTimeout(() => {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Gateway Timeout' }));
        }, timeout);

        try {
          // Call Zintrust handler
          await this.config.handler(req, res, body);
        } finally {
          clearTimeout(timeoutHandle);
        }

        this.logger?.debug('Request processed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          remoteAddr: req.socket.remoteAddress,
        });
      } catch (error) {
        this.logger?.error('Request processing error', error as Error);
        this.handleError(res, error as Error);
      }
    });

    req.on('error', (error: Error) => {
      this.handleRequestError(res, error);
    });
  }

  /**
   * Handle request handler errors
   */
  private handleError(res: ServerResponse, error: Error): void {
    this.logger?.error('Request handler error', error);

    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Internal Server Error',
          statusCode: 500,
          timestamp: new Date().toISOString(),
          ...(Env.get('NODE_ENV') === 'development' && {
            message: error.message,
          }),
        })
      );
    }
  }

  /**
   * Handle request stream errors
   */
  private handleRequestError(res: ServerResponse, error: Error): void {
    this.logger?.error('Request error', error);
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request' }));
    }
  }
}

function createDefaultLogger() {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(
        `[Node.js] ${msg}`,
        data !== undefined && data !== null ? JSON.stringify(data) : ''
      ),
    info: (msg: string, data?: unknown) =>
      Logger.info(
        `[Node.js] ${msg}`,
        data !== undefined && data !== null ? JSON.stringify(data) : ''
      ),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(
        `[Node.js] ${msg}`,
        data !== undefined && data !== null ? JSON.stringify(data) : ''
      ),
    error: (msg: string, err?: Error) => Logger.error(`[Node.js] ${msg}`, err?.message),
  };
}
