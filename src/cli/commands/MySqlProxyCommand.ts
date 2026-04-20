import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ensureProxyEnvLoadedForCwd } from '@cli/commands/ProxyCommandUtils';
import {
  addSqlProxyOptions,
  runSqlProxyCommand,
  type SqlProxyCommandOptions,
} from '@cli/commands/SqlProxyCommandUtils';
import { Env } from '@config/env';
import type { Command } from 'commander';

type MySqlProxyOptions = SqlProxyCommandOptions & CommandOptions;

const addOptions = (command: Command): void => {
  ensureProxyEnvLoadedForCwd();

  addSqlProxyOptions(command, {
    hostDefault: Env.get('MYSQL_PROXY_HOST', '127.0.0.1'),
    portDefault: Env.getInt('MYSQL_PROXY_PORT', 8789),
    maxBodyBytesDefault: Env.getInt('MYSQL_PROXY_MAX_BODY_BYTES', 131072),
    dbVendorLabel: 'MySQL',
    requireSigningDefault: Env.getBool('MYSQL_PROXY_REQUIRE_SIGNING', true),
    keyIdDefault: Env.get('MYSQL_PROXY_KEY_ID', Env.get('APP_NAME', 'ZinTrust')),
    secretDefault: Env.get('MYSQL_PROXY_SECRET', Env.get('APP_KEY', '')),
    signingWindowMsDefault: Env.getInt(
      'MYSQL_PROXY_SIGNING_WINDOW_MS',
      Env.getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
    ),
  });
};

export const MySqlProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:mysql',
      aliases: ['mysql:proxy', 'mysql-proxy', 'proxy:my'],
      description: 'Start the MySQL HTTP proxy for Cloudflare Workers',
      addOptions,
      execute: async (options: MySqlProxyOptions) => {
        await runSqlProxyCommand(options, async (input) => {
          const { MySqlProxyServer } = await import('@proxy/mysql/MySqlProxyServer');
          await MySqlProxyServer.start(input);
        });
      },
    });
  },
});

export default MySqlProxyCommand;
