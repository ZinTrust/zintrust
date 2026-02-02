import { MySqlProxyServer } from '@/proxy/mysql/MySqlProxyServer';
import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type MySqlProxyOptions = CommandOptions & {
  host?: string;
  port?: string;
  maxBodyBytes?: string;
  dbHost?: string;
  dbPort?: string;
  dbName?: string;
  dbUser?: string;
  dbPass?: string;
  connectionLimit?: string;
  requireSigning?: boolean;
  keyId?: string;
  secret?: string;
  signingWindowMs?: string;
};

const parseIntOption = (raw: string | undefined, name: string): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw ErrorFactory.createCliError(`Invalid --${name} '${raw}'. Expected a positive number.`);
  }
  return parsed;
};

const addOptions = (command: Command): void => {
  command.option('--host <host>', 'Host to bind', Env.MYSQL_PROXY_HOST);
  command.option('--port <port>', 'Port to bind', String(Env.MYSQL_PROXY_PORT));
  command.option(
    '--max-body-bytes <bytes>',
    'Max request size in bytes',
    String(Env.MYSQL_PROXY_MAX_BODY_BYTES)
  );

  command.option('--db-host <host>', 'MySQL host', Env.DB_HOST);
  command.option('--db-port <port>', 'MySQL port', String(Env.DB_PORT));
  command.option('--db-name <name>', 'MySQL database', Env.DB_DATABASE);
  command.option('--db-user <user>', 'MySQL username', Env.DB_USERNAME);
  command.option('--db-pass <pass>', 'MySQL password', Env.DB_PASSWORD);
  command.option(
    '--connection-limit <max>',
    'MySQL connection pool limit',
    String(Env.MYSQL_PROXY_POOL_LIMIT)
  );

  command.option('--require-signing', 'Require signed requests');
  command.option('--key-id <id>', 'Signing key id', Env.MYSQL_PROXY_KEY_ID);
  command.option('--secret <secret>', 'Signing secret', Env.MYSQL_PROXY_SECRET);
  command.option(
    '--signing-window-ms <ms>',
    'Signing time window in ms',
    String(Env.MYSQL_PROXY_SIGNING_WINDOW_MS)
  );
};

export const MySqlProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:mysql',
      aliases: ['mysql:proxy', 'mysql-proxy'],
      description: 'Start the MySQL HTTP proxy for Cloudflare Workers',
      addOptions,
      execute: async (options: MySqlProxyOptions) => {
        const host = options.host?.trim();
        const port = parseIntOption(options.port, 'port');
        const maxBodyBytes = parseIntOption(options.maxBodyBytes, 'max-body-bytes');

        const dbHost = options.dbHost?.trim();
        const dbPort = parseIntOption(options.dbPort, 'db-port');
        const dbName = options.dbName?.trim();
        const dbUser = options.dbUser?.trim();
        const dbPass = options.dbPass;

        const connectionLimit = parseIntOption(options.connectionLimit, 'connection-limit');
        const signingWindowMs = parseIntOption(options.signingWindowMs, 'signing-window-ms');

        await MySqlProxyServer.start({
          host,
          port,
          maxBodyBytes,
          dbHost,
          dbPort,
          dbName,
          dbUser,
          dbPass,
          connectionLimit,
          requireSigning: options.requireSigning === true,
          keyId: options.keyId,
          secret: options.secret,
          signingWindowMs,
        });
      },
    });
  },
});

export default MySqlProxyCommand;
