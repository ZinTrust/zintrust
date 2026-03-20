import type { CliCommandProvider } from '@zintrust/core/cli';

type Registry = {
  register: (id: string, provider: CliCommandProvider) => void;
};

type WorkerCommandsModule = {
  WorkerCommands: {
    createWorkerListCommand: () => CliCommandProvider;
    createWorkerStatusCommand: () => CliCommandProvider;
    createWorkerStartCommand: () => CliCommandProvider;
    createWorkerStartAllCommand: () => CliCommandProvider;
    createWorkerStopCommand: () => CliCommandProvider;
    createWorkerRestartCommand: () => CliCommandProvider;
    createWorkerSummaryCommand: () => CliCommandProvider;
  };
};

const commandModule = (await (async (): Promise<WorkerCommandsModule> => {
  return (await import('@zintrust/core/cli')) as unknown as WorkerCommandsModule;
})()) satisfies WorkerCommandsModule;

const getWorkerProviders = (): Array<[string, CliCommandProvider]> => {
  const { WorkerCommands } = commandModule;

  return [
    ['worker:list', WorkerCommands.createWorkerListCommand()],
    ['worker:status', WorkerCommands.createWorkerStatusCommand()],
    ['worker:start', WorkerCommands.createWorkerStartCommand()],
    ['worker:start-all', WorkerCommands.createWorkerStartAllCommand()],
    ['worker:stop', WorkerCommands.createWorkerStopCommand()],
    ['worker:restart', WorkerCommands.createWorkerRestartCommand()],
    ['worker:summary', WorkerCommands.createWorkerSummaryCommand()],
  ];
};

export function registerWorkerCliCommands(registry: Registry): void {
  for (const [id, provider] of getWorkerProviders()) {
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

registerWorkerCliCommands({
  register: (id, provider) => {
    globalRegistry.set(id, provider);
  },
});

try {
  const core = (await import('@zintrust/core/cli')) as unknown as {
    OptionalCliCommandRegistry?: Registry;
  };

  if (core.OptionalCliCommandRegistry !== undefined) {
    registerWorkerCliCommands(core.OptionalCliCommandRegistry);
  }
} catch {
  // no-op
}
