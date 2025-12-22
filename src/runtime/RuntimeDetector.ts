import { Env } from '@config/env';
import Logger from '@config/logger';
import { AdapterConfig, RuntimeAdapter, ZintrustHandler } from '@runtime/RuntimeAdapter';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';
import { DenoAdapter } from '@runtime/adapters/DenoAdapter';
import { FargateAdapter } from '@runtime/adapters/FargateAdapter';
import { LambdaAdapter } from '@runtime/adapters/LambdaAdapter';
import { NodeServerAdapter } from '@runtime/adapters/NodeServerAdapter';

/**
 * Runtime detector - automatically selects appropriate adapter based on environment
 * Supports: Lambda, Fargate, Cloudflare Workers, Deno, and standard Node.js
 */

const RUNTIME_VAR = 'RUNTIME';
const AUTO = 'auto';

function hasEnvValue(key: string): boolean {
  return Env.get(key).trim() !== '';
}

/**
 * Detect current runtime environment
 */
export function detectRuntime(): string {
  const explicit = Env.get(RUNTIME_VAR).trim();

  if (explicit !== '' && explicit !== AUTO) return explicit;

  // Auto-detection logic
  if (isLambda() === true) {
    return 'lambda';
  }

  if (isCloudflare() === true) {
    return 'cloudflare';
  }

  if (isDeno() === true) {
    return 'deno';
  }

  // Default to nodejs for containers (Fargate, Docker, Cloud Run)
  return 'nodejs';
}

/**
 * Create appropriate adapter for detected runtime
 */
export function createAdapter(config: AdapterConfig): RuntimeAdapter {
  const runtime = detectRuntime();
  return createAdapterForRuntime(runtime, config);
}

/**
 * Create adapter for specific runtime
 */
export function createAdapterForRuntime(runtime: string, config: AdapterConfig): RuntimeAdapter {
  const logger = config.logger ?? createDefaultLogger();

  switch (runtime.toLowerCase()) {
    case 'lambda':
      logger.info('Using Lambda adapter');
      return new LambdaAdapter(config);

    case 'fargate':
      logger.info('Using Fargate adapter');
      return new FargateAdapter(config);

    case 'cloudflare':
      logger.info('Using Cloudflare Workers adapter');
      return new CloudflareAdapter(config);

    case 'deno':
      logger.info('Using Deno adapter');
      return new DenoAdapter(config) as unknown as RuntimeAdapter;

    case 'nodejs':
    default:
      logger.info('Using Node.js HTTP server adapter');
      return new NodeServerAdapter(config);
  }
}

/**
 * Check if running on AWS Lambda
 */
function isLambda(): boolean {
  return (
    hasEnvValue('LAMBDA_TASK_ROOT') === true ||
    hasEnvValue('AWS_LAMBDA_FUNCTION_NAME') === true ||
    hasEnvValue('AWS_EXECUTION_ENV') === true
  );
}

/**
 * Check if running on Cloudflare Workers
 */
function isCloudflare(): boolean {
  // @ts-expect-error - Cloudflare Workers global
  return globalThis.CF !== undefined;
}

/**
 * Check if running on Deno
 */
function isDeno(): boolean {
  return (globalThis as unknown as { Deno: unknown }).Deno !== undefined;
}

/**
 * Get runtime information for logging/debugging
 */
export function getRuntimeInfo(): Record<string, unknown> {
  const runtime = detectRuntime();
  const info: Record<string, unknown> = {
    detected_runtime: runtime,
    node_env: Env.NODE_ENV,
    node_version: process.version,
  };

  if (runtime === 'lambda') {
    info['lambda_function_name'] = Env.get('AWS_LAMBDA_FUNCTION_NAME', '');
    info['lambda_function_version'] = Env.get('AWS_LAMBDA_FUNCTION_VERSION', '');
    info['aws_region'] = Env.get('AWS_REGION', '');
  } else if (runtime === 'deno') {
    // @ts-expect-error - Deno global
    info.deno_version = (globalThis as unknown as Record<string, { version?: { deno?: string } }>)[
      'Deno'
    ]?.version?.deno;
  }

  return info;
}

export const RuntimeDetector = {
  RUNTIME_VAR,
  AUTO,
  detectRuntime,
  createAdapter,
  createAdapterForRuntime,
  getRuntimeInfo,
};

/**
 * Application bootstrap factory
 * Creates and configures runtime-appropriate HTTP handler
 */

/**
 * Initialize application for current runtime
 */
export async function initialize(handler: ZintrustHandler): Promise<void> {
  const config: AdapterConfig = {
    handler,
    logger: createDefaultLogger(),
    timeout: Env.REQUEST_TIMEOUT,
    maxBodySize: Env.MAX_BODY_SIZE,
  };

  const runtime = detectRuntime();
  const adapter = createAdapterForRuntime(runtime, config);

  const logger = adapter.getLogger();
  const runtimeInfo = getRuntimeInfo();

  logger.info('Application initializing', runtimeInfo);

  // Start appropriate server based on runtime
  switch (runtime) {
    case 'fargate':
    case 'nodejs': {
      const port = Env.PORT;
      const host = Env.HOST;

      const serverAdapter = adapter as unknown as {
        startServer?: (port: number, host: string) => Promise<void>;
      };
      if (serverAdapter.startServer !== undefined) {
        await serverAdapter.startServer(port, host);
      }
      break;
    }

    case 'deno': {
      const port = Env.PORT;
      const host = '0.0.0.0';

      const serverAdapter = adapter as unknown as {
        startServer?: (port: number, host: string) => Promise<void>;
      };
      if (serverAdapter.startServer !== undefined) {
        await serverAdapter.startServer(port, host);
      }
      break;
    }

    case 'lambda':
    case 'cloudflare':
      // These platforms handle request routing externally
      logger.info('Adapter initialized, ready for events');
      break;
  }
}

/**
 * Handle graceful shutdown
 */
export async function shutdown(signal: string = 'SIGTERM'): Promise<void> {
  const logger = createDefaultLogger();
  logger.info(`Received ${signal}, gracefully shutting down...`);

  // Perform cleanup tasks
  process.exit(0);
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(): void {
  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      await shutdown(signal);
    });
  });
}

export const ApplicationBootstrap = {
  initialize,
  shutdown,
  setupGracefulShutdown,
};

interface RuntimeLogger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, err?: unknown): void;
}

function createDefaultLogger(): RuntimeLogger {
  return {
    debug: (msg: string, data?: unknown): void =>
      Logger.debug(
        `[Runtime] ${msg}`,
        data === undefined ? undefined : (data as Record<string, unknown>)
      ),
    info: (msg: string, data?: unknown): void =>
      Logger.info(
        `[Runtime] ${msg}`,
        data === undefined ? undefined : (data as Record<string, unknown>)
      ),
    warn: (msg: string, data?: unknown): void =>
      Logger.warn(
        `[Runtime] ${msg}`,
        data === undefined ? undefined : (data as Record<string, unknown>)
      ),
    error: (msg: string, err?: unknown): void => {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`[Runtime] ${msg}`, { error: message });
    },
  };
}
