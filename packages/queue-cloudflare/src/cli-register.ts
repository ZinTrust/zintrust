type Registry = {
  register: (id: string, provider: CliCommandProvider) => void;
};

type CliCommandProvider = {
  getCommand: () => unknown;
  name?: string;
};

type CommandModule = {
  MigrateCloudflareQueueCommand: {
    create: () => CliCommandProvider;
  };
};

const commandModule = (await import('./cli/MigrateCloudflareQueueCommand.js')) as CommandModule;

export function registerCloudflareQueueCliCommands(registry: Registry): void {
  registry.register('migrate:queue-cloudflare', commandModule.MigrateCloudflareQueueCommand.create());
}

type GlobalWithRegistry = {
  __zintrust_cli_command_registry__?: Map<string, CliCommandProvider>;
};

const globalWithRegistry = globalThis as unknown as GlobalWithRegistry;
const globalRegistry =
  globalWithRegistry.__zintrust_cli_command_registry__ ??
  (globalWithRegistry.__zintrust_cli_command_registry__ = new Map<string, CliCommandProvider>());

registerCloudflareQueueCliCommands({
  register: (id, provider) => {
    globalRegistry.set(id, provider);
  },
});

try {
  const coreCli = (await import('@zintrust/core/cli')) as unknown as {
    OptionalCliCommandRegistry?: Registry;
  };

  if (coreCli.OptionalCliCommandRegistry !== undefined) {
    registerCloudflareQueueCliCommands(coreCli.OptionalCliCommandRegistry);
  }
} catch {
  // no-op
}
