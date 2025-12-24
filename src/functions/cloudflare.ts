import { Application } from '@boot/Application';
import { Logger } from '@config/logger';
import { IKernel, Kernel } from '@http/Kernel';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { CloudflareAdapter } from '@runtime/adapters/CloudflareAdapter';

let kernel: IKernel | null = null;

async function initializeKernel(): Promise<IKernel> {
  if (kernel) {
    return kernel;
  }

  const app = Application.create();
  await app.boot();

  kernel = Kernel.create(app.getRouter(), app.getContainer());

  return kernel;
}

export default {
  async fetch(request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    try {
      const app = await initializeKernel();

      const adapter = CloudflareAdapter.create({
        handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
          await app.handle(req, res);
        },
      });

      const platformResponse = await adapter.handle(request);
      return adapter.formatResponse(platformResponse) as Response;
    } catch (error) {
      Logger.error('Cloudflare handler error:', error as Error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
