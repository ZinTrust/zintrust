import { Application } from '@/Application';
import { Logger } from '@config/logger';
import { IKernel, Kernel } from '@http/Kernel';
import { DenoAdapter } from '@runtime/adapters/DenoAdapter';
import { IncomingMessage, ServerResponse } from 'node:http';

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

const deno = async (request: Request): Promise<Response> => {
  try {
    const app = await initializeKernel();

    const adapter = DenoAdapter.create({
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        await app.handle(req, res);
      },
    });

    const platformResponse = await adapter.handle(request);
    return adapter.formatResponse(platformResponse) as Response;
  } catch (error) {
    Logger.error('Deno handler error:', error as Error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

export default deno;
