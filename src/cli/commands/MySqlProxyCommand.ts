import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  addSqlProxyOptions,
  runSqlProxyCommand,
  type SqlProxyCommandOptions,
} from '@cli/commands/SqlProxyCommandUtils';
import { Env } from '@config/env';
import { MySqlProxyServer } from '@proxy/mysql/MySqlProxyServer';
import type { Command } from 'commander';

type MySqlProxyOptions = SqlProxyCommandOptions & CommandOptions;

const addOptions = (command: Command): void => {
  addSqlProxyOptions(command, {
    hostDefault: Env.MYSQL_PROXY_HOST,
    portDefault: Env.MYSQL_PROXY_PORT,
    maxBodyBytesDefault: Env.MYSQL_PROXY_MAX_BODY_BYTES,
    dbVendorLabel: 'MySQL',
    requireSigningDefault: Env.MYSQL_PROXY_REQUIRE_SIGNING,
    keyIdDefault: Env.MYSQL_PROXY_KEY_ID,
    secretDefault: Env.MYSQL_PROXY_SECRET,
    signingWindowMsDefault: Env.MYSQL_PROXY_SIGNING_WINDOW_MS,
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
          await MySqlProxyServer.start(input);
        });
      },
    });
  },
});

export default MySqlProxyCommand;
