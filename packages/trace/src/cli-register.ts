type Registry = {
  register: (id: string, provider: CliCommandProvider) => void;
};

type CliCommandProvider = {
  getCommand: () => unknown;
  name?: string;
};

type TraceCommandsModule = {
  TraceCommands: {
    createTracePruneProvider: () => CliCommandProvider;
    createTraceClearProvider: () => CliCommandProvider;
    createTraceStatusProvider: () => CliCommandProvider;
    createTraceMigrateProvider: () => CliCommandProvider;
  };
};

const commandModule = (await import('@zintrust/core/cli')) as unknown as TraceCommandsModule;

const getTraceProviders = (): Array<[string, CliCommandProvider]> => {
  const { TraceCommands } = commandModule;

  return [
    ['trace:prune', TraceCommands.createTracePruneProvider()],
    ['trace:clear', TraceCommands.createTraceClearProvider()],
    ['trace:status', TraceCommands.createTraceStatusProvider()],
    ['migrate:trace', TraceCommands.createTraceMigrateProvider()],
  ];
};

export function registerTraceCliCommands(registry: Registry): void {
  for (const [id, provider] of getTraceProviders()) {
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

registerTraceCliCommands({
  register: (id, provider) => {
    globalRegistry.set(id, provider);
  },
});

try {
  const coreCli = (await import('@zintrust/core/cli')) as unknown as {
    OptionalCliCommandRegistry?: Registry;
  };

  if (coreCli.OptionalCliCommandRegistry !== undefined) {
    registerTraceCliCommands(coreCli.OptionalCliCommandRegistry);
  }
} catch {
  // no-op
}
