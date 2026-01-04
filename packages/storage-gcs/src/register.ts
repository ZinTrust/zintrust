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
  GcsDriver?: unknown;
};

if (core.StorageDriverRegistry !== undefined && core.GcsDriver !== undefined) {
  core.StorageDriverRegistry.register('gcs', { driver: core.GcsDriver });
}
