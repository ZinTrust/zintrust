import type { OptionalCliCommandRegistry as CoreCommandRegistry } from '@zintrust/core/cli';
import type { Command } from 'commander';

type CliCommandProvider = {
  getCommand: () => Command;
  name?: string;
};

type Registry = {
  register: (id: string, provider: CliCommandProvider) => void;
};

type D1MigratorRegisterModule = {
  MigrateToD1Command: CliCommandProvider;
};

const commandModule = (await (async (): Promise<D1MigratorRegisterModule> => {
  try {
    return (await import('./cli/MigrateToD1Command.js')) as D1MigratorRegisterModule;
  } catch {
    return (await import('./cli/MigrateToD1Command')) as D1MigratorRegisterModule;
  }
})()) satisfies D1MigratorRegisterModule;

export function registerD1MigratorCommand(registry: Registry): void {
  registry.register('migrate-to-d1', commandModule.MigrateToD1Command);
}

type GlobalWithRegistry = {
  __zintrust_cli_command_registry__?: Map<string, CliCommandProvider>;
};

const globalWithRegistry = globalThis as unknown as GlobalWithRegistry;
const globalRegistry =
  globalWithRegistry.__zintrust_cli_command_registry__ ??
  (globalWithRegistry.__zintrust_cli_command_registry__ = new Map<string, CliCommandProvider>());

registerD1MigratorCommand({
  register: (id, provider) => {
    globalRegistry.set(id, provider);
  },
});

try {
  const core = (await import('@zintrust/core')) as unknown as {
    OptionalCliCommandRegistry?: typeof CoreCommandRegistry;
  };

  if (core.OptionalCliCommandRegistry !== undefined) {
    registerD1MigratorCommand(core.OptionalCliCommandRegistry);
  }
} catch {
  // no-op
}
