import { NodemailerDriver, type MailMessage, type NodemailerMailConfig } from './index.js';

type Registry = {
  register: (
    driver: string,
    handler: (cfg: unknown, msg: unknown) => Promise<{ ok: boolean; messageId?: string }>
  ) => void;
};

export function registerNodemailerDriver(registry: Registry): void {
  registry.register('nodemailer', async (config, message) => {
    return NodemailerDriver.send(config as NodemailerMailConfig, message as MailMessage);
  });
}

const importCore = async (): Promise<unknown> => {
  try {
    return await import('@zintrust/core');
  } catch {
    return {};
  }
};

const core = (await importCore()) as unknown as {
  MailDriverRegistry?: Registry;
};

if (typeof core.MailDriverRegistry?.register === 'function') {
  registerNodemailerDriver(core.MailDriverRegistry);
}
