export type MailSendHandler = (
  config: unknown,
  message: unknown
) => Promise<{ ok: boolean; messageId?: string }>;

const registry = new Map<string, MailSendHandler>();

function register(driver: string, handler: MailSendHandler): void {
  registry.set(driver, handler);
}

function get(driver: string): MailSendHandler | undefined {
  return registry.get(driver);
}

function has(driver: string): boolean {
  return registry.has(driver);
}

function list(): string[] {
  return Array.from(registry.keys());
}

export const MailDriverRegistry = Object.freeze({
  register,
  get,
  has,
  list,
});
