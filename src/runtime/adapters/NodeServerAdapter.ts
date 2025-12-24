import { Env } from '@config/env';
import Logger from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
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
 * Sealed namespace for immutability
 */
export const NodeServerAdapter = Object.freeze({
  /**
   * Create a new Node.js server adapter instance
   */
  create(config: AdapterConfig): RuntimeAdapter & {
    startServer(port?: number, host?: string): Promise<void>;
    stop(): Promise<void>;
  } {
    const logger = config.logger || createDefaultLogger();
    const state: { server?: Server } = {};

    return {
      platform: 'nodejs',

      async handle(): Promise<PlatformResponse> {
        throw ErrorFactory.createConfigError(
          'Node.js adapter requires startServer() method. Use RuntimeDetector for automatic initialization.'
        );
      },

      /**
       * Start HTTP server for Node.js environments
       */
      async startServer(port: number = 3000, host: string = 'localhost'): Promise<void> {
        return startNodeServer(state, config, logger, port, host);
      },

      /**
       * Stop the HTTP server gracefully
       */
      async stop(): Promise<void> {
        return stopNodeServer(state, logger);
      },

      parseRequest(): PlatformRequest {
        throw ErrorFactory.createConfigError('Node.js adapter uses native Node.js HTTP');
      },

      formatResponse(): unknown {
        throw ErrorFactory.createConfigError('Node.js adapter uses native Node.js HTTP');
      },

      getLogger(): {
        debug(msg: string, data?: unknown): void;
        info(msg: string, data?: unknown): void;
        warn(msg: string, data?: unknown): void;
        error(msg: string, err?: Error): void;
      } {
        return (
          logger ?? {
            debug: (msg: string) => Logger.debug(`[Node.js] ${msg}`),
            info: (msg: string) => Logger.info(`[Node.js] ${msg}`),
            warn: (msg: string) => Logger.warn(`[Node.js] ${msg}`),
            error: (msg: string, err?: Error) => Logger.error(`[Node.js] ${msg}`, err?.message),
          }
        );
      },

      supportsPersistentConnections(): boolean {
        return true;
      },

      getEnvironment(): {
        nodeEnv: string;
        runtime: string;
        dbConnection: string;
        dbHost?: string;
        dbPort?: number;
        [key: string]: unknown;
      } {
        return getNodeEnvironment();
      },
    };
  },
});

/**
 * Start Node.js HTTP server
 */
async function startNodeServer(
  state: { server?: Server },
  config: AdapterConfig,
  logger: AdapterConfig['logger'],
  port: number,
  host: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    state.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void handleRequest(req, res, config, logger);
    });

    state.server.listen(port, host, () => {
      logger?.info(`Node.js server listening on http://${host}:${port}`);
      resolve();
    });

    state.server.on('error', (error: Error) => {
      logger?.error('Server error', error);
      reject(error);
    });

    state.server.on('clientError', (error: Error, socket) => {
      if ((error as NodeJS.ErrnoException).code === 'ECONNRESET' || !socket.writable) {
        return;
      }
      logger?.warn(`Client error: ${error.message}`);
    });
  });
}

/**
 * Stop Node.js HTTP server
 */
async function stopNodeServer(
  state: { server?: Server },
  logger: AdapterConfig['logger']
): Promise<void> {
  return new Promise((resolve) => {
    if (state.server) {
      state.server.close(() => {
        logger?.info('Node.js server stopped');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

/**
 * Get Node.js environment
 */
function getNodeEnvironment(): {
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

/**
 * Handle request processing
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AdapterConfig,
  logger?: AdapterConfig['logger']
): Promise<void> {
  const chunks: Buffer[] = [];
  let body: Buffer | null = null;

  // Collect request body
  req.on('data', (chunk: Buffer) => {
    const maxSize = config.maxBodySize ?? 10 * 1024 * 1024;
    if (chunks.length * chunk.length > maxSize) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload Too Large' }));
      req.socket.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async (): Promise<void> => {
    try {
      body = chunks.length > 0 ? Buffer.concat(chunks) : null;

      // Set request timeout
      const timeout = config.timeout ?? 30000;
      const timeoutHandle = setTimeout(() => {
        if (!res.headersSent) {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Gateway Timeout' }));
        }
      }, timeout);

      try {
        // Call Zintrust handler
        await config.handler(req, res, body);
      } finally {
        clearTimeout(timeoutHandle);
      }

      logger?.debug('Request processed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        remoteAddr: req.socket.remoteAddress,
      });
    } catch (error) {
      const err = error as Error;
      logger?.error('Request processing error', err);
      Logger.error('Request processing error', err.message);
      handleError(res, err, logger);
    }
  });

  req.on('error', (error: Error) => {
    Logger.error('Request stream error', error.message);
    handleRequestError(res, error, logger);
  });
}

/**
 * Handle request handler errors
 */
function handleError(res: ServerResponse, error: Error, logger?: AdapterConfig['logger']): void {
  logger?.error('Request handler error', error);
  Logger.error('Request handler error', error.message);

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
function handleRequestError(
  res: ServerResponse,
  error: Error,
  logger?: AdapterConfig['logger']
): void {
  logger?.error('Request error', error);
  Logger.error('Request error', error.message);
  if (!res.headersSent) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request' }));
  }
}

function createDefaultLogger(): AdapterConfig['logger'] {
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
