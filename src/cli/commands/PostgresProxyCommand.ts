import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ensureProxyEnvLoadedForCwd } from '@cli/commands/ProxyCommandUtils';
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
  ensureProxyEnvLoadedForCwd();

  addSqlProxyOptions(command, {
    hostDefault: Env.get('POSTGRES_PROXY_HOST', '127.0.0.1'),
    portDefault: Env.getInt('POSTGRES_PROXY_PORT', 8790),
    maxBodyBytesDefault: Env.getInt('POSTGRES_PROXY_MAX_BODY_BYTES', 131072),
    dbVendorLabel: 'PostgreSQL',
    requireSigningDefault: Env.getBool('POSTGRES_PROXY_REQUIRE_SIGNING', true),
    keyIdDefault: Env.get('POSTGRES_PROXY_KEY_ID', Env.get('APP_NAME', 'ZinTrust')),
    secretDefault: Env.get('POSTGRES_PROXY_SECRET', Env.get('APP_KEY', '')),
    signingWindowMsDefault: Env.getInt(
      'POSTGRES_PROXY_SIGNING_WINDOW_MS',
      Env.getInt('ZT_PROXY_SIGNING_WINDOW_MS', 60000)
    ),
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
