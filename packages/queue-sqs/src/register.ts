type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

import { SqsQueue } from './index.js';

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@/index');
  } catch {
    return await import('@zintrust/core');
  }
};

const core = (await importCore()) as unknown as {
  Queue?: QueueApi;
};

if (core.Queue !== undefined) {
  core.Queue.register('sqs', SqsQueue.create());
}
