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
  S3Driver?: unknown;
};

if (core.StorageDriverRegistry !== undefined && core.S3Driver !== undefined) {
  core.StorageDriverRegistry.register('s3', { driver: core.S3Driver });
}
