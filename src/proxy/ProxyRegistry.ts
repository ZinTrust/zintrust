export type ProxyRegistration = Readonly<{
  name: string;
  description: string;
}>;

const registry = new Map<string, ProxyRegistration>();

const register = (proxy: ProxyRegistration): void => {
  registry.set(proxy.name, proxy);
};

const get = (name: string): ProxyRegistration | undefined => registry.get(name);

const list = (): ProxyRegistration[] => Array.from(registry.values());

export const ProxyRegistry = Object.freeze({
  register,
  get,
  list,
});
