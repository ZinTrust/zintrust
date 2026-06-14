type QueueApi = {
  register?: (name: string, driver: unknown) => void;
};

export async function registerCloudflareQueueDriver(queue: QueueApi): Promise<void> {
  const { CloudflareQueues } = (await import('./index.js')) as unknown as {
    CloudflareQueues: { create: (config?: unknown) => unknown };
  };

  if (typeof queue.register !== 'function') return;

  const driver = CloudflareQueues.create();
  queue.register('cloudflare', driver);
  queue.register('cloudflare-queues', driver);
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
  } catch {
    return {};
  }
};

const core = (await importCore()) as {
  Queue?: QueueApi;
};

if (typeof core.Queue?.register === 'function') {
  await registerCloudflareQueueDriver(core.Queue);
}
