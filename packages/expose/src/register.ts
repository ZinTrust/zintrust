import { ExposeCommand } from './ExposeCommand.js';

type OptionalCliCommandRegistryLike = {
  register: (name: string, command: typeof ExposeCommand) => void;
};

type CoreModuleLike = {
  OptionalCliCommandRegistry?: OptionalCliCommandRegistryLike;
};

try {
  const core = (await import('@zintrust/core')) as CoreModuleLike;

  if (core.OptionalCliCommandRegistry !== undefined) {
    core.OptionalCliCommandRegistry.register('expose', ExposeCommand);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to register expose command: ${message}\n`);
}
