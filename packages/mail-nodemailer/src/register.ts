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

const core = (await import('@zintrust/core')) as unknown as {
  MailDriverRegistry?: Registry;
};

if (core.MailDriverRegistry !== undefined) {
  registerNodemailerDriver(core.MailDriverRegistry);
}
