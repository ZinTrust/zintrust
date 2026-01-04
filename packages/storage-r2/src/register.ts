type Registry = {
  register: (driverName: string, entry: { driver: unknown; normalize?: unknown }) => void;
};

export async function registerR2StorageDriver(registry: Registry): Promise<void> {
  const core = (await importCore()) as unknown as {
    R2Driver?: unknown;
  };

  if (core.R2Driver === undefined) return;

  registry.register('r2', { driver: core.R2Driver });
}

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
};

if (core.StorageDriverRegistry !== undefined) {
  await registerR2StorageDriver(core.StorageDriverRegistry);
}
