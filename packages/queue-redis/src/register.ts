type QueueApi = {
  register: (name: string, driver: unknown) => void;
};

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
  RedisQueue?: unknown;
};

if (core.Queue !== undefined && core.RedisQueue !== undefined) {
  core.Queue.register('redis', core.RedisQueue);
}
