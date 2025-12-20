import { Application } from '@/Application';
import { Logger } from '@config/logger';
import { Kernel } from '@http/Kernel';
import { LambdaAdapter } from '@runtime/adapters/LambdaAdapter';
import { PlatformResponse } from '@runtime/RuntimeAdapter';

/**
 * AWS Lambda handler entry point
 * Exports handler function for use in Lambda configuration
 *
 * Usage in serverless.yml or SAM template:
 * handler: functions/lambda.handler
 */

let kernel: Kernel | null = null;

/**
 * Initialize Zintrust kernel once per container (warm containers)
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
  // This would normally come from routes/api.ts

  return kernel;
}

/**
 * AWS Lambda handler
 * Receives API Gateway or ALB events and returns formatted response
 */
export async function handler(
  event: unknown,
  context: {
    requestId: string;
    functionName: string;
    functionVersion: string;
    memoryLimitInMB: string;
  }
): Promise<PlatformResponse> {
  try {
    // Initialize kernel (once per warm container)
    const app = await initializeKernel();

    // Create Lambda adapter
    const adapter = new LambdaAdapter({
      handler: async (req, res) => {
        // Process through Zintrust kernel
        await app.handleRequest(req, res);
      },
    });

    // Handle Lambda event
    const response = await adapter.handle(event, context);

    // Log request for CloudWatch
    const startTime = Date.now();
    const duration = Date.now() - startTime;

    Logger.info('Lambda execution summary', {
      timestamp: new Date().toISOString(),
      requestId: context.requestId,
      duration,
      statusCode: response.statusCode,
      functionName: context.functionName,
      functionVersion: context.functionVersion,
      memoryUsed: context.memoryLimitInMB,
    });

    return response;
  } catch (error) {
    Logger.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

/**
 * Lambda warmup handler
 * Used by CloudWatch Events or other services to keep Lambda warm
 * Reduces cold start time for actual requests
 */
export async function warmup(): Promise<{ statusCode: number }> {
  try {
    await initializeKernel();
    return { statusCode: 200 };
  } catch (error) {
    Logger.error('Warmup failed:', error);
    return { statusCode: 500 };
  }
}
