type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

export async function registerRedisQueueDriver(queue: QueueApi): Promise<void> {
  const mod = await import('./RedisQueue');
  queue.register('redis', mod.default);
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
  await registerRedisQueueDriver(core.Queue);
}
