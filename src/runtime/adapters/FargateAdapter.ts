/**
 * Runtime adapter for AWS Fargate
 *
 * Refactor note:
 * - Extracted all internal logic into exported, named functions so they can be unit tested directly.
 * - Removed nested event-handler nesting where possible by introducing readIncomingMessageBody().
 */
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from '@node-singletons/http';
import type {
  AdapterConfig,
  PlatformRequest,
  PlatformResponse,
  RuntimeAdapter,
} from '@runtime/RuntimeAdapter';

export interface FargateEnvironment {
  [key: string]: unknown;
  nodeEnv: string;
  runtime: string;
  dbConnection: string;
  dbHost: string | undefined;
  dbPort: number | undefined;
}

export interface FargateAdapterState {
  server?: Server;
}

export type NodeServerFactory = (
  requestListener: (req: IncomingMessage, res: ServerResponse) => void
) => Server;

export function createFargateAdapter(config: AdapterConfig): RuntimeAdapter & {
  startServer(port?: number, host?: string): Promise<void>;
  stop(): Promise<void>;
} {
  const logger = config.logger ?? createDefaultFargateLogger();
  const state: FargateAdapterState = {};

  return {
    platform: 'fargate',

    async handle(_event: unknown, _context?: unknown): Promise<PlatformResponse> {
      // Fargate adapter doesn't handle individual requests
      // Instead, use startServer() to run continuous HTTP server
      return Promise.reject(
        ErrorFactory.createConfigError(
          'Fargate adapter requires startServer() method. Use RuntimeDetector for automatic initialization.'
        )
      );
    },

    parseRequest(_event: unknown): PlatformRequest {
      throw ErrorFactory.createConfigError('Fargate adapter uses native Node.js HTTP server');
    },

    formatResponse(_response: PlatformResponse): unknown {
      throw ErrorFactory.createConfigError('Fargate adapter uses native Node.js HTTP server');
    },

    async startServer(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
      return startFargateServer(state, config, logger, port, host);
    },

    async stop(): Promise<void> {
      return stopFargateServer(state, logger);
    },

    getLogger(): NonNullable<AdapterConfig['logger']> {
      return (
        logger ?? {
          debug: (msg: string) => Logger.debug(`[Fargate] ${msg}`),
          info: (msg: string) => Logger.info(`[Fargate] ${msg}`),
          warn: (msg: string) => Logger.warn(`[Fargate] ${msg}`),
          error: (msg: string, err?: Error) => Logger.error(`[Fargate] ${msg}`, err?.message),
        }
      );
    },

    supportsPersistentConnections(): boolean {
      // Container environments support persistent connections
      return true;
    },

    getEnvironment(): FargateEnvironment {
      return {
        nodeEnv: Env.NODE_ENV,
        runtime: 'fargate',
        dbConnection: Env.DB_CONNECTION,
        dbHost: Env.DB_HOST,
        dbPort: Env.DB_PORT,
      };
    },
  };
}

/**
 * Fargate/Container adapter for running Zintrust in AWS Fargate, Cloud Run, or Docker
 * Wraps existing Node.js HTTP server for container orchestration
 * Sealed namespace for immutability
 */
export const FargateAdapter = Object.freeze({
  create: createFargateAdapter,
});

export async function startFargateServer(
  state: FargateAdapterState,
  config: AdapterConfig,
  logger: AdapterConfig['logger'],
  port: number,
  host: string,
  serverFactory: NodeServerFactory = createServer
): Promise<void> {
  return new Promise((resolve, reject) => {
    state.server = serverFactory((req: IncomingMessage, res: ServerResponse) => {
      void handleFargateRequest(config, logger, req, res);
    });

    state.server.listen(port, host, () => {
      logger?.info(`Fargate server listening on http://${host}:${port}`);
      resolve();
    });

    state.server.on('error', (error: Error) => {
      logger?.error('Server error', error);
      reject(error);
    });
  });
}

export async function stopFargateServer(
  state: FargateAdapterState,
  logger: AdapterConfig['logger']
): Promise<void> {
  const server = state.server;
  if (server === undefined) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        logger?.error('Error closing server', error);
        reject(error);
        return;
      }
      resolve();
    });
  });

  state.server = undefined;
}

/**
 * Read the full request body (Buffer) for IncomingMessage.
 * Exported for unit testing.
 */
export async function readIncomingMessageBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise<Buffer | null>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(chunks.length === 0 ? null : Buffer.concat(chunks));
    });

    req.on('error', (error: Error) => {
      reject(error);
    });
  });
}

export async function handleFargateRequest(
  config: AdapterConfig,
  logger: AdapterConfig['logger'],
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readIncomingMessageBody(req);

    try {
      await config.handler(req, res, body);
    } catch (error: unknown) {
      const err = normalizeError(error);
      Logger.error('Request handler error', err);
      if (res.headersSent === false) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  } catch (error: unknown) {
    Logger.error('Error reading request body', error);
    const err = normalizeError(error);
    logger?.error('Request error', err);
    if (res.headersSent === false) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
}

/**
 * Exported helper for tests (and safer than casting unknown to Error).
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return ErrorFactory.createGeneralError(error);
  return ErrorFactory.createGeneralError('Unknown error', error);
}

export function createDefaultFargateLogger(): AdapterConfig['logger'] {
  return {
    debug: (msg: string, data?: unknown) =>
      Logger.debug(`[Fargate] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    info: (msg: string, data?: unknown) =>
      Logger.info(`[Fargate] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    warn: (msg: string, data?: unknown) =>
      Logger.warn(`[Fargate] ${msg}`, data === undefined ? '' : JSON.stringify(data)),
    error: (msg: string, err?: Error) => Logger.error(`[Fargate] ${msg}`, err?.message),
  };
}
