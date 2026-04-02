type Registry = {
  register: (id: string, provider: CliCommandProvider) => void;
};

type CliCommandProvider = {
  getCommand: () => unknown;
  name?: string;
};

type DebuggerCommandsModule = {
  DebuggerCommands: {
    createDebuggerPruneProvider: () => CliCommandProvider;
    createDebuggerClearProvider: () => CliCommandProvider;
    createDebuggerStatusProvider: () => CliCommandProvider;
    createDebuggerMigrateProvider: () => CliCommandProvider;
  };
};

const commandModule = (await import('@zintrust/core/cli')) as unknown as DebuggerCommandsModule;

const getDebuggerProviders = (): Array<[string, CliCommandProvider]> => {
  const { DebuggerCommands } = commandModule;

  return [
    ['debugger:prune', DebuggerCommands.createDebuggerPruneProvider()],
    ['debugger:clear', DebuggerCommands.createDebuggerClearProvider()],
    ['debugger:status', DebuggerCommands.createDebuggerStatusProvider()],
    ['migrate:debugger', DebuggerCommands.createDebuggerMigrateProvider()],
  ];
};

export function registerDebuggerCliCommands(registry: Registry): void {
  for (const [id, provider] of getDebuggerProviders()) {
    registry.register(id, provider);
  }
}

type GlobalWithRegistry = {
  __zintrust_cli_command_registry__?: Map<string, CliCommandProvider>;
};

const globalWithRegistry = globalThis as unknown as GlobalWithRegistry;
const globalRegistry =
  globalWithRegistry.__zintrust_cli_command_registry__ ??
  (globalWithRegistry.__zintrust_cli_command_registry__ = new Map<string, CliCommandProvider>());

registerDebuggerCliCommands({
  register: (id, provider) => {
    globalRegistry.set(id, provider);
  },
});

try {
  const coreCli = (await import('@zintrust/core/cli')) as unknown as {
    OptionalCliCommandRegistry?: Registry;
  };

  if (coreCli.OptionalCliCommandRegistry !== undefined) {
    registerDebuggerCliCommands(coreCli.OptionalCliCommandRegistry);
  }
} catch {
  // no-op
}
