import { Application } from '@/Application';
import { Logger } from '@config/logger';
import { Kernel } from '@http/Kernel';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';

/**
 * Cloudflare Workers handler entry point
 * Exports fetch handler for use in Cloudflare Workers
 *
 * Usage in wrangler.toml:
 * main = "functions/cloudflare.ts"
 */

let kernel: Kernel | null = null;

/**
 * Initialize Zintrust kernel once per isolate
 */
async function initializeKernel(): Promise<Kernel> {
  if (kernel) {
    return kernel;
  }

  const app = new Application(process.cwd());
  const router = app.getRouter();
  const middlewareStack = app.getMiddlewareStack();
  const container = app.getContainer();

  kernel = new Kernel(router, middlewareStack, container);

  // Register routes, middleware, etc.

  return kernel;
}

/**
 * Cloudflare Workers fetch handler
 * Standard Web API fetch handler for edge compute
 */
export default {
  async fetch(request: Request, _env: CloudflareEnv, _ctx: ExecutionContext): Promise<Response> {
    try {
      // Initialize kernel
      const app = await initializeKernel();

      // Create Cloudflare adapter
      const adapter = new CloudflareAdapter({
        handler: async (req, res): Promise<void> => {
          // Process through Zintrust kernel
          await app.handleRequest(req, res);
        },
      });

      // Handle request
      const response = await adapter.handle(request);

      // Convert to Cloudflare Response
      return adapter.formatResponse(response);
    } catch (error) {
      Logger.error('Cloudflare handler error:', error as Error);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          statusCode: 500,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },

  /**
   * Optional: Scheduled handler for cron jobs
   */
  async scheduled(
    event: ScheduledEvent,
    _env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    Logger.info('Cron job triggered:', { cron: event.cron });
    // Handle scheduled tasks
  },
};

/**
 * Cloudflare Worker environment bindings
 */
interface CloudflareEnv {
  /**
   * D1 database binding
   */
  DB?: D1Database;

  /**
   * KV namespace for caching/secrets
   */
  CACHE?: KVNamespace;
  SECRETS?: KVNamespace;

  /**
   * Environment variables
   */
  ENVIRONMENT?: string;
  DB_CONNECTION?: string;
  [key: string]: unknown;
}

/**
 * D1 Database binding type
 */
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

/**
 * D1 Prepared Statement
 */
interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  all(): Promise<D1Result>;
  first(columnName?: string): Promise<unknown>;
  run(): Promise<D1Result>;
}

/**
 * D1 Query Result
 */
interface D1Result {
  success: boolean;
  results: unknown[];
  meta: {
    duration: number;
    served_by: string;
    internal_stats: string;
  };
}

/**
 * KV Namespace type
 */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>;
}

interface KVNamespacePutOptions {
  expirationTtl?: number;
  metadata?: unknown;
}

interface KVNamespaceListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
}

interface KVNamespaceListResult {
  keys: Array<{ name: string; metadata?: unknown }>;
  list_complete: boolean;
  cursor?: string;
}

/**
 * Execution context for Cloudflare Workers
 */
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * Scheduled event for cron jobs
 */
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}
