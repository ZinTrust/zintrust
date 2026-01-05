type Registry = {
  register: (driverName: string, entry: { driver: unknown; normalize?: unknown }) => void;
};

export async function registerGcsStorageDriver(registry: Registry): Promise<void> {
  const core = (await importCore()) as unknown as {
    GcsDriver?: unknown;
  };

  if (core.GcsDriver === undefined) return;

  registry.register('gcs', { driver: core.GcsDriver });
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
  StorageDriverRegistry?: Registry;
};

if (core.StorageDriverRegistry !== undefined) {
  await registerGcsStorageDriver(core.StorageDriverRegistry);
}
