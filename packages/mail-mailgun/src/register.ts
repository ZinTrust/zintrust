type Registry = {
  register: (
    driver: string,
    handler: (config: unknown, message: unknown) => Promise<unknown>
  ) => void;
};

export async function registerMailgunMailDriver(registry: Registry): Promise<void> {
  const core = (await importCore()) as unknown as {
    MailgunDriver?: { send: (config: unknown, message: unknown) => Promise<unknown> };
  };

  const driver = core.MailgunDriver;
  if (driver === undefined) return;

  registry.register('mailgun', (config, message) => driver.send(config, message));
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
  await registerMailgunMailDriver(core.MailDriverRegistry);
}
