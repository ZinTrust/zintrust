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
    return await import('@zintrust/core');
  }
};

const core = (await importCore()) as unknown as {
  MailDriverRegistry?: Registry;
  SendGridDriver?: { send: (config: unknown, message: unknown) => Promise<unknown> };
};

if (core.MailDriverRegistry !== undefined && core.SendGridDriver !== undefined) {
  core.MailDriverRegistry.register('sendgrid', (config, message) =>
    core.SendGridDriver!.send(config, message)
  );
}
