import { Application } from '@boot/Application';
import { Logger } from '@config/logger';
import { IKernel, Kernel } from '@http/Kernel';
import { LambdaAdapter } from '@runtime/adapters/LambdaAdapter';
import { IncomingMessage, ServerResponse } from 'node:http';

let kernel: IKernel | null = null;

async function initializeKernel(): Promise<IKernel> {
  if (kernel !== null) {
    return kernel;
  }

  const app = Application.create();
  await app.boot();

  kernel = Kernel.create(app.getRouter(), app.getContainer());

  return kernel;
}

export const handler = async (event: unknown, context: unknown): Promise<unknown> => {
  try {
    const app = await initializeKernel();

    const adapter = LambdaAdapter.create({
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        await app.handle(req, res);
      },
    });

    return await adapter.handle(event, context);
  } catch (error) {
    Logger.error('Lambda handler error:', error as Error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
