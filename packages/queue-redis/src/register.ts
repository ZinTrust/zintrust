type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

export async function registerRedisQueueDriver(queue: QueueApi): Promise<void> {
  const core = (await importCore()) as unknown as {
    RedisQueue?: unknown;
  };

  if (core.RedisQueue === undefined) return;
  queue.register('redis', core.RedisQueue);
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
  RedisQueue?: unknown;
};

if (core.Queue !== undefined) {
  await registerRedisQueueDriver(core.Queue);
}
