import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import { ProxyRegistry } from '@proxy/ProxyRegistry';
import '@proxy/d1/register';
import '@proxy/kv/register';
import '@proxy/mysql/register';
import '@proxy/postgres/register';
import '@proxy/redis/register';
import '@proxy/smtp/register';
import type { Command } from 'commander';

const PROXY_TARGET_MAP: Readonly<Record<string, string>> = Object.freeze({
  mysql: 'proxy:mysql',
  my: 'proxy:mysql',
  postgres: 'proxy:postgres',
  postgresql: 'proxy:postgres',
  pg: 'proxy:postgres',
  redis: 'proxy:redis',
  smtp: 'proxy:smtp',
  mail: 'proxy:smtp',
  mongodb: 'proxy:mongodb',
  mongo: 'proxy:mongodb',
  sqlserver: 'proxy:sqlserver',
  mssql: 'proxy:sqlserver',
});

const addOptions = (command: Command): void => {
  command.argument('[target]', 'Proxy target (e.g. postgres, mysql, redis, smtp)');
};

const parseForwardArgs = (): { target: string | null; extra: string[] } => {
  const argv = process.argv.slice(2);
  const proxyIndex = argv.indexOf('proxy');
  if (proxyIndex < 0) {
    return { target: null, extra: [] };
  }

  const target = argv[proxyIndex + 1] ?? null;
  const extra = argv.slice(proxyIndex + 2);
  return { target, extra };
};

const dispatchProxyTarget = async (targetRaw: string): Promise<void> => {
  const target = targetRaw.trim().toLowerCase();
  const mapped = PROXY_TARGET_MAP[target];

  if (!mapped) {
    throw ErrorFactory.createCliError(
      `Unknown proxy target '${targetRaw}'. Use one of: ${Object.keys(PROXY_TARGET_MAP).join(', ')}`
    );
  }

  const { extra } = parseForwardArgs();
  const exitCode = await SpawnUtil.spawnAndWait({
    command: 'tsx',
    args: [path.join('bin', 'zin.ts'), mapped, ...extra],
    env: {
      ...process.env,
    },
    forwardSignals: false,
  });

  process.exit(exitCode);
};

export const ProxyCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'proxy',
      description: 'List available proxy servers',
      addOptions,
      execute: async (options: CommandOptions): Promise<void> => {
        const firstArg = Array.isArray(options.args) ? options.args[0] : undefined;
        if (typeof firstArg === 'string' && firstArg.trim() !== '') {
          await dispatchProxyTarget(firstArg);
          return;
        }

        const list = ProxyRegistry.list();
        if (list.length === 0) {
          throw ErrorFactory.createCliError('No proxies registered');
        }

        for (const proxy of list) {
          cmd.info(`${proxy.name}: ${proxy.description}`);
        }
      },
    });

    return cmd;
  },
});

export default ProxyCommand;
