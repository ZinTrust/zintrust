type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

export async function registerSqsQueueDriver(queue: QueueApi): Promise<void> {
  const { SqsQueue } = (await import('./index.js')) as unknown as {
    SqsQueue: { create: (config?: unknown) => unknown };
  };

  queue.register('sqs', SqsQueue.create());
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@/index');
  } catch {
    try {
      return await import('@zintrust/core');
    } catch {
      return {};
    }
  }
};

const core = (await importCore()) as unknown as {
  Queue?: QueueApi;
};

if (core.Queue !== undefined) {
  await registerSqsQueueDriver(core.Queue);
}
