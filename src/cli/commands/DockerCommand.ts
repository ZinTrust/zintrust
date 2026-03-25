import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { DockerPushCommand } from '@cli/commands/DockerPushCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { existsSync, readdirSync, renameSync, unlinkSync } from '@node-singletons/fs';
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

const isContainersProxyConfig = (config: string): boolean => {
  const base = config.split(/[/\\]/).pop() ?? config;
  return (
    base === 'wrangler.containers-proxy.jsonc' ||
    base === 'wrangler.containers-proxy.json' ||
    base === 'wrangler.containers-proxy.toml' ||
    base.startsWith('wrangler.containers-proxy.')
  );
};

const getDevVarsBackupPath = (cwd: string, name: string): string =>
  join(cwd, `${name}.disabled-by-zin`);

const clearLegacyDevVarsBackups = (cwd: string, name: string): void => {
  const legacyPrefix = `${name}.disabled-by-zin-`;
  const entries = readdirSync(cwd);

  for (const entry of entries) {
    if (!entry.startsWith(legacyPrefix)) continue;

    try {
      unlinkSync(join(cwd, entry));
    } catch {
      // noop
    }
  }
};

const reconcileDevVarsBackup = (cwd: string, name: string): string => {
  const targetPath = join(cwd, name);
  const backupPath = getDevVarsBackupPath(cwd, name);

  clearLegacyDevVarsBackups(cwd, name);

  const hasTarget = existsSync(targetPath);
  const hasBackup = existsSync(backupPath);

  if (!hasBackup) return backupPath;

  if (!hasTarget) {
    renameSync(backupPath, targetPath);
    return backupPath;
  }

  unlinkSync(backupPath);
  return backupPath;
};

const withDevVarsForConfig = async <T>(
  cwd: string,
  config: string,
  envName: string,
  fn: () => Promise<T>
): Promise<T> => {
  const moved: Array<{ from: string; to: string }> = [];
  const swappedIn: Array<{ from: string; to: string }> = [];

  const disable = (name: string): void => {
    const from = join(cwd, name);
    if (!existsSync(from)) return;

    const to = reconcileDevVarsBackup(cwd, name);
    renameSync(from, to);
    moved.push({ from, to });
  };

  const swapIn = (source: string, target: string): void => {
    const from = join(cwd, source);
    if (!existsSync(from)) return;

    const to = join(cwd, target);
    if (existsSync(to)) return;

    renameSync(from, to);
    swappedIn.push({ from, to });
  };

  try {
    if (isContainersProxyConfig(config)) {
      // For containers-proxy configs, we want `.dev.vars*` to exist but only for
      // this run. Users keep the files renamed as `.dev.vars*.containers-proxy`.
      swapIn('.dev.vars.containers-proxy', '.dev.vars');
      if (envName !== '') {
        swapIn(`.dev.vars.${envName}.containers-proxy`, `.dev.vars.${envName}`);
      }
      return await fn();
    }

    // For all other configs, disable `.dev.vars*` so Wrangler relies on `.env*`.
    disable('.dev.vars');
    disable('.dev.vars.local');
    disable('.dev.vars.staging');
    disable('.dev.vars.staging.local');
    if (envName !== '') {
      disable(`.dev.vars.${envName}`);
      disable(`.dev.vars.${envName}.local`);
    }

    return await fn();
  } finally {
    const restoreSwaps = swappedIn.slice().reverse();
    for (const item of restoreSwaps) {
      try {
        if (existsSync(item.to) && !existsSync(item.from)) renameSync(item.to, item.from);
      } catch {
        // noop
      }
    }

    const restoreMoved = moved.slice().reverse();
    for (const item of restoreMoved) {
      try {
        if (existsSync(item.to)) renameSync(item.to, item.from);
      } catch {
        // noop
      }
    }
  }
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
  const exitCode = await withDevVarsForConfig(cwd, config, env, async () => {
    return SpawnUtil.spawnAndWait({ command: 'wrangler', args, env: process.env });
  });
  process.exit(exitCode);
};

export const DockerCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'docker',
      aliases: ['dkr', 'dk'],
      description: 'Run Wrangler dev using a Docker-backed Cloudflare Containers config',
      addOptions: (command: Command): void => {
        // `zin docker push` (subcommand) for Docker Hub publishing.
        // Keep `zin docker` itself as the Wrangler dev command.
        const pushCommand = DockerPushCommand.create().getCommand();
        pushCommand.name('push');
        command.addCommand(pushCommand);

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
