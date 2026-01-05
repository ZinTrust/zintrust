type Registry = {
  register: (
    driver: string,
    handler: (config: unknown, message: unknown) => Promise<unknown>
  ) => void;
};

export async function registerSmtpMailDriver(registry: Registry): Promise<void> {
  const core = (await importCore()) as unknown as {
    SmtpDriver?: { send: (config: unknown, message: unknown) => Promise<unknown> };
  };

  if (core.SmtpDriver === undefined) return;

  registry.register('smtp', (config, message) => core.SmtpDriver.send(config, message));
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
  MailDriverRegistry?: Registry;
};

if (core.MailDriverRegistry !== undefined) {
  await registerSmtpMailDriver(core.MailDriverRegistry);
}
