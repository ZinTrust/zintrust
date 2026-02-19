import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import type { Command } from 'commander';

type DockerCommandOptions = CommandOptions & {
  env?: string;
  wranglerConfig?: string;
  port?: string;
};

const resolveDefaultWranglerConfig = (cwd: string): string | undefined => {
  const candidates = [
    'wrangler.containers-proxy.jsonc',
    'wrangler.containers-proxy.json',
    'wrangler.containers-proxy.toml',
    'wrangler.jsonc',
    'wrangler.json',
    'wrangler.toml',
  ];

  for (const candidate of candidates) {
    const full = join(cwd, candidate);
    if (existsSync(full)) return candidate;
  }

  return undefined;
};

const resolvePort = (raw: string | undefined): string | undefined => {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) {
    throw ErrorFactory.createCliError(`Error: Invalid --port '${value}'. Expected 1-65535.`);
  }
  return String(parsed);
};

const resolveWranglerConfig = (cwd: string, options: DockerCommandOptions): string => {
  const fromCli = typeof options.wranglerConfig === 'string' ? options.wranglerConfig.trim() : '';
  if (fromCli.length > 0) {
    const full = join(cwd, fromCli);
    if (existsSync(full)) return fromCli;
    throw ErrorFactory.createCliError(`Wrangler config not found: ${fromCli}`);
  }

  const fallback = resolveDefaultWranglerConfig(cwd);
  if (typeof fallback === 'string' && fallback.length > 0) return fallback;

  throw ErrorFactory.createCliError(
    'Wrangler config not found. Expected wrangler.containers-proxy.jsonc (or wrangler.jsonc/toml).'
  );
};

const executeDocker = async (options: DockerCommandOptions): Promise<void> => {
  const cwd = process.cwd();
  const config = resolveWranglerConfig(cwd, options);
  const env = typeof options.env === 'string' ? options.env.trim() : '';
  const port = resolvePort(options.port);

  const args: string[] = ['dev', '--config', config];
  if (typeof port === 'string' && port.length > 0) args.push('--port', port);
  if (env.length > 0) args.push('--env', env);

  Logger.info('Starting Wrangler dev (Containers/Docker-backed)...');
  const exitCode = await SpawnUtil.spawnAndWait({ command: 'wrangler', args, env: process.env });
  process.exit(exitCode);
};

export const DockerCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'docker',
      aliases: ['dkr', 'dk'],
      description: 'Run Wrangler dev using a Docker-backed Cloudflare Containers config',
      addOptions: (command: Command): void => {
        command.option(
          '-c, --wrangler-config <path>',
          'Wrangler config file (defaults if present)'
        );
        command.option('-e, --env <name>', 'Wrangler environment name');
        command.option('-p, --port <number>', 'Port for wrangler dev');
      },
      execute: async (options: CommandOptions): Promise<void> =>
        executeDocker(options as DockerCommandOptions),
    });
  },
});
