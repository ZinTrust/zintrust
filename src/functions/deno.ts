import { Application } from '@/Application';
import { Logger } from '@config/logger';
import { Kernel } from '@http/Kernel';
import { DenoAdapter } from '@runtime/adapters/DenoAdapter';

/**
 * Deno Deploy handler entry point
 * Used for serverless deployment on Deno Deploy or Edge networks
 *
 * Command to run locally:
 * deno run --allow-net functions/deno.ts
 *
 * Deploy to Deno Deploy:
 * deno deploy --project=<project-name> functions/deno.ts
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
 * Deno fetch handler
 * Standard Web API fetch for Deno Deploy
 */
const deno = async (request: Request): Promise<Response> => {
  try {
    // Initialize kernel
    const app = await initializeKernel();

    // Create Deno adapter
    const adapter = new DenoAdapter({
      handler: async (req, res) => {
        // Process through Zintrust kernel
        await app.handleRequest(req, res);
      },
    });

    // Handle request
    const response = await adapter.handle(request);

    // Convert to Web Response
    return adapter.formatResponse(response);
  } catch (error) {
    Logger.error('Deno handler error:', error as Error);
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
};
export default deno;

/**
 * Optional: Run local Deno server
 * Uncomment to test locally with: deno run --allow-net functions/deno.ts
 */
// @ts-ignore - Deno specific property
if (import.meta.main) {
  const adapter = new DenoAdapter({
    handler: async (req, res): Promise<void> => {
      // Process through Zintrust kernel
      const app = await initializeKernel();
      await app.handleRequest(req, res);
    },
  });

  // @ts-ignore - Deno is available in Deno runtime
  const port = Number.parseInt(Deno.env.get('PORT') || '3000', 10);
  // @ts-ignore - Deno is available in Deno runtime
  const host = Deno.env.get('HOST') || '0.0.0.0';

  Logger.info(`Starting Deno server on ${host}:${port}...`);

  try {
    await adapter.startServer(port, host);
  } catch (error) {
    Logger.error('Failed to start server:', error as Error);
    // @ts-ignore - Deno is available in Deno runtime
    Deno.exit(1);
  }
}
