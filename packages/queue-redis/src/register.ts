type QueueApi = {
  register?: (name: string, driver: unknown) => void;
};

export async function registerRedisQueueDriver(queue: QueueApi): Promise<void> {
  const mod = await import('./BullMQRedisQueue');
  if (typeof queue.register !== 'function') return;
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

const core = (await importCore()) as {
  Queue?: QueueApi;
};

if (typeof core.Queue?.register === 'function') {
  await registerRedisQueueDriver(core.Queue);
}
