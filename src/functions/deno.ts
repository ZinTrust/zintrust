import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { DenoAdapter } from '@runtime/adapters/DenoAdapter';

import { getKernel } from '@runtime/getKernel';

const deno = async (request: Request): Promise<Response> => {
  try {
    const kernel = await getKernel();

    const adapter = DenoAdapter.create({
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        await kernel.handle(req, res);
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
