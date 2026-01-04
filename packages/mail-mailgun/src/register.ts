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

  if (core.MailgunDriver === undefined) return;

  registry.register('mailgun', (config, message) => core.MailgunDriver.send(config, message));
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
  MailDriverRegistry?: Registry;
};

if (core.MailDriverRegistry !== undefined) {
  await registerMailgunMailDriver(core.MailDriverRegistry);
}
