type Registry = {
  register: (
    driver: string,
    handler: (config: unknown, message: unknown) => Promise<unknown>
  ) => void;
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
  MailDriverRegistry?: Registry;
  SmtpDriver?: { send: (config: unknown, message: unknown) => Promise<unknown> };
};

if (core.MailDriverRegistry !== undefined && core.SmtpDriver !== undefined) {
  core.MailDriverRegistry.register('smtp', (config, message) =>
    core.SmtpDriver.send(config, message)
  );
}
