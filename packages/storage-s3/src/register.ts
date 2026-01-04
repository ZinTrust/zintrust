type Registry = {
  register: (driverName: string, entry: { driver: unknown; normalize?: unknown }) => void;
};

export async function registerS3StorageDriver(registry: Registry): Promise<void> {
  const core = (await importCore()) as unknown as {
    S3Driver?: unknown;
  };

  if (core.S3Driver === undefined) return;

  registry.register('s3', { driver: core.S3Driver });
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
  await registerS3StorageDriver(core.StorageDriverRegistry);
}
