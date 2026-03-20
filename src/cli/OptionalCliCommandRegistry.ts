import { isObject } from '@helper/index';
import type { Command } from 'commander';

export type CliCommandProvider = {
  getCommand: () => Command;
  name?: string;
};

type GlobalWithRegistry = {
  __zintrust_cli_command_registry__?: Map<string, CliCommandProvider>;
};

const globalWithRegistry = globalThis as unknown as GlobalWithRegistry;
const registry =
  globalWithRegistry.__zintrust_cli_command_registry__ ??
  (globalWithRegistry.__zintrust_cli_command_registry__ = new Map<string, CliCommandProvider>());

const isCliCommandProvider = (value: unknown): value is CliCommandProvider => {
  return isObject(value) && typeof value['getCommand'] === 'function';
};

const normalizeId = (id: string): string => id.trim();

export const OptionalCliCommandRegistry = Object.freeze({
  register(id: string, provider: CliCommandProvider): void {
    const normalizedId = normalizeId(id);
    if (normalizedId === '' || !isCliCommandProvider(provider)) return;
    registry.set(normalizedId, provider);
  },

  get(id: string): CliCommandProvider | undefined {
    return registry.get(normalizeId(id));
  },

  has(id: string): boolean {
    return registry.has(normalizeId(id));
  },

  list(): CliCommandProvider[] {
    return Array.from(registry.values());
  },
});
