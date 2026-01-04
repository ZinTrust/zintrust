type Registry = {
  register: (driverName: string, entry: { driver: unknown; normalize?: unknown }) => void;
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
  StorageDriverRegistry?: Registry;
  R2Driver?: unknown;
};

if (core.StorageDriverRegistry !== undefined && core.R2Driver !== undefined) {
  core.StorageDriverRegistry.register('r2', { driver: core.R2Driver });
}
