type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

export async function registerRabbitMqQueueDriver(queue: QueueApi): Promise<void> {
  const { RabbitMqQueue } = (await import('./index.js')) as unknown as {
    RabbitMqQueue: { create: (config?: unknown) => unknown };
  };

  queue.register('rabbitmq', RabbitMqQueue.create());
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
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
  await registerRabbitMqQueueDriver(core.Queue);
}
