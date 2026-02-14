import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export const resolveComposePath = (composeFileName: string, missingMessage: string): string => {
  const composePath = join(process.cwd(), composeFileName);
  if (!existsSync(composePath)) {
    throw ErrorFactory.createCliError(missingMessage);
  }
  return composePath;
};

export const runComposeWithFallback = async (args: string[]): Promise<void> => {
  try {
    const exitCode = await SpawnUtil.spawnAndWait({ command: 'docker', args });
    if (exitCode !== 0) process.exit(exitCode);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("'docker' not found")) {
      throw error;
    }
  }

  Logger.warn("'docker' not found. Falling back to 'docker-compose'.");
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'docker-compose',
    args: args.slice(1),
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
};
