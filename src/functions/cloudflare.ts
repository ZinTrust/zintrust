import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import * as AppRoutes from '@routes/api';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';

import { getKernel } from '@runtime/getKernel';

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    try {
      // Make bindings available to framework code in Workers
      (globalThis as unknown as { env?: unknown }).env = _env;
      (globalThis as unknown as { __zintrustRoutes?: unknown }).__zintrustRoutes = AppRoutes;

      const kernel = await getKernel();

      const adapter = CloudflareAdapter.create({
        handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
          await kernel.handle(req, res);
        },
      });

      const platformResponse = await adapter.handle(request);
      return adapter.formatResponse(platformResponse) as Response;
    } catch (error) {
      const err = error as Error;
      Logger.error('Cloudflare handler error:', err);
      if (typeof err?.stack === 'string' && err.stack.trim() !== '') {
        Logger.error('Cloudflare handler stack:', err.stack);
      }
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

export { WorkerShutdownDurableObject } from '@zintrust/workers';
