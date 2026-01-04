type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@/index');
  } catch {
    return await import('@zintrust/core');
  }
};

const core = (await importCore()) as unknown as {
  Queue?: QueueApi;
  RedisQueue?: unknown;
};

if (core.Queue !== undefined && core.RedisQueue !== undefined) {
  core.Queue.register('redis', core.RedisQueue);
}
