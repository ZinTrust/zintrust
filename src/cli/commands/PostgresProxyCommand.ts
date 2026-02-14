import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  addSqlProxyOptions,
  runSqlProxyCommand,
  type SqlProxyCommandOptions,
} from '@cli/commands/SqlProxyCommandUtils';
import { Env } from '@config/env';
import { PostgresProxyServer } from '@proxy/postgres/PostgresProxyServer';
import type { Command } from 'commander';

type PostgresProxyOptions = SqlProxyCommandOptions & CommandOptions;

const addOptions = (command: Command): void => {
  addSqlProxyOptions(command, {
    hostDefault: Env.POSTGRES_PROXY_HOST,
    portDefault: Env.POSTGRES_PROXY_PORT,
    maxBodyBytesDefault: Env.POSTGRES_PROXY_MAX_BODY_BYTES,
    dbVendorLabel: 'PostgreSQL',
    requireSigningDefault: Env.POSTGRES_PROXY_REQUIRE_SIGNING,
    keyIdDefault: Env.POSTGRES_PROXY_KEY_ID,
    secretDefault: Env.POSTGRES_PROXY_SECRET,
    signingWindowMsDefault: Env.POSTGRES_PROXY_SIGNING_WINDOW_MS,
  });
};

export const PostgresProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:postgres',
      aliases: ['postgres:proxy', 'postgres-proxy', 'proxy:pg', 'pg:proxy', 'pg-proxy'],
      description: 'Start the PostgreSQL HTTP proxy for Cloudflare Workers',
      addOptions,
      execute: async (options: PostgresProxyOptions) => {
        await runSqlProxyCommand(options, async (input) => {
          await PostgresProxyServer.start(input);
        });
      },
    });
  },
});

export default PostgresProxyCommand;
