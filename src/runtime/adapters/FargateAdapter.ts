/**
 * Runtime adapter for AWS Fargate
 */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import {
  AdapterConfig,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';

/**
 * Fargate/Container adapter for running Zintrust in AWS Fargate, Cloud Run, or Docker
 * Wraps existing Node.js HTTP server for container orchestration
 */
export class FargateAdapter implements RuntimeAdapter {
  readonly platform = 'fargate' as const;
  private readonly config: AdapterConfig;
  private readonly logger: AdapterConfig['logger'];
  private server?: Server;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.logger = config.logger || createDefaultLogger();
  }

  async handle(): Promise<PlatformResponse> {
    // Fargate adapter doesn't handle individual requests
    // Instead, use startServer() to run continuous HTTP server
    throw new Error(
      'Fargate adapter requires startServer() method. Use RuntimeDetector for automatic initialization.'
    );
  }

  /**
   * Start continuous HTTP server for container environments
   */
  async startServer(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => this.handleRequestData(chunk, chunks, res));
          req.on('end', () => this.handleRequestEnd(chunks, req, res));
          req.on('error', (error: Error) => this.handleRequestError(error, res));
        } catch (error) {
          this.logger?.error('Connection error', error as Error);
        }
      });

      this.server.listen(port, host, () => {
        this.logger?.info(`Fargate server listening on ${host}:${port}`);
        resolve();
      });

      this.server.on('error', (error: Error) => {
        this.logger?.error('Server error', error);
        reject(error);
      });
    });
  }

  private handleRequestData(chunk: Buffer, chunks: Buffer[], res: ServerResponse): void {
    if (chunks.length * chunk.length > (this.config.maxBodySize || 10 * 1024 * 1024)) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload Too Large' }));
      return;
    }
    chunks.push(chunk);
  }

  private async handleRequestEnd(
    chunks: Buffer[],
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
      await this.executeRequestHandler(req, res, body);
    } catch (error) {
      this.logger?.error('Request handler error', error as Error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Internal Server Error',
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  private async executeRequestHandler(
    req: IncomingMessage,
    res: ServerResponse,
    body: Buffer | null
  ): Promise<void> {
    const timeout = this.config.timeout || 30000;
    const timeoutHandle = setTimeout(() => {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway Timeout' }));
    }, timeout);

    try {
      await this.config.handler(req, res, body);
    } finally {
      clearTimeout(timeoutHandle);
      this.logger?.debug('Request processed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
      });
    }
  }

  private handleRequestError(error: Error, res: ServerResponse): void {
    this.logger?.error('Request error', error);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request' }));
  }

  /**
   * Stop the HTTP server gracefully
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger?.info('Fargate server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  parseRequest(): PlatformRequest {
    throw new Error('Fargate adapter uses native Node.js HTTP server');
  }

  formatResponse(): unknown {
    throw new Error('Fargate adapter uses native Node.js HTTP server');
  }

  getLogger() {
    return (
      this.logger || {
        debug: (msg: string) => Logger.debug(`[Fargate] ${msg}`),
        info: (msg: string) => Logger.info(`[Fargate] ${msg}`),
        warn: (msg: string) => Logger.warn(`[Fargate] ${msg}`),
        error: (msg: string, err?: Error) => Logger.error(`[Fargate] ${msg}`, err?.message),
      }
    );
  }

  supportsPersistentConnections(): boolean {
    // Container environments support persistent connections
    return true;
  }

  getEnvironment() {
    return {
      nodeEnv: Env.NODE_ENV,
      runtime: 'fargate',
      dbConnection: Env.DB_CONNECTION,
      dbHost: Env.DB_HOST,
      dbPort: Env.DB_PORT,
    };
  }
}

function createDefaultLogger() {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(`[Fargate] ${msg}`, data ? JSON.stringify(data) : ''),
    info: (msg: string, data?: unknown) =>
      Logger.info(`[Fargate] ${msg}`, data ? JSON.stringify(data) : ''),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(`[Fargate] ${msg}`, data ? JSON.stringify(data) : ''),
    error: (msg: string, err?: Error) => Logger.error(`[Fargate] ${msg}`, err?.message),
  };
}
