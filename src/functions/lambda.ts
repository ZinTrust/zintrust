import { Logger } from '@config/logger';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { LambdaAdapter } from '@runtime/adapters/LambdaAdapter';

import { getKernel } from '@runtime/getKernel';

export const handler = async (event: unknown, context: unknown): Promise<unknown> => {
  try {
    const kernel = await getKernel();

    const adapter = LambdaAdapter.create({
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        await kernel.handle(req, res);
      },
    });

    return await adapter.handle(event, context);
  } catch (error) {
    Logger.error('Lambda handler error:', error as Error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Internal Server Error',
      }),
    };
  }
};
