import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  maybeRunProxyWatchMode,
  parseIntOption,
  trimOption,
} from '@cli/commands/ProxyCommandUtils';
import { Env } from '@config/env';
import { RedisProxyServer } from '@proxy/redis/RedisProxyServer';
import type { Command } from 'commander';

type RedisProxyOptions = CommandOptions & {
  host?: string;
  port?: string;
  maxBodyBytes?: string;
  redisHost?: string;
  redisPort?: string;
  redisPassword?: string;
  redisDb?: string;
  requireSigning?: boolean;
  keyId?: string;
  secret?: string;
  signingWindowMs?: string;
  watch?: boolean;
};

const addOptions = (command: Command): void => {
  command.option('--host <host>', 'Host to bind', Env.get('REDIS_PROXY_HOST', '127.0.0.1'));
  command.option('--port <port>', 'Port to bind', String(Env.getInt('REDIS_PROXY_PORT', 8791)));
  command.option(
    '--max-body-bytes <bytes>',
    'Max request size in bytes',
    String(Env.getInt('REDIS_PROXY_MAX_BODY_BYTES', 131072))
  );
  command.option('--watch', 'Auto-restart proxy on file changes');

  command.option('--redis-host <host>', 'Redis host');
  command.option('--redis-port <port>', 'Redis port');
  command.option('--redis-password <password>', 'Redis password');
  command.option('--redis-db <db>', 'Redis database');

  command.option('--require-signing', 'Require signed requests', Env.REDIS_PROXY_REQUIRE_SIGNING);
  command.option('--key-id <id>', 'Signing key id', Env.get('REDIS_PROXY_KEY_ID', ''));
  command.option('--secret <secret>', 'Signing secret', Env.get('REDIS_PROXY_SECRET', ''));
  command.option(
    '--signing-window-ms <ms>',
    'Signing time window in ms',
    String(Env.getInt('REDIS_PROXY_SIGNING_WINDOW_MS', 60000))
  );
};

export const RedisProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:redis',
      aliases: ['redis:proxy', 'redis-proxy', 'proxy:red'],
      description: 'Start the Redis HTTP proxy for Cloudflare Workers',
      addOptions,
      execute: async (options: RedisProxyOptions) => {
        await maybeRunProxyWatchMode(options.watch);

        const host = trimOption(options.host);
        const port = parseIntOption(options.port, 'port');
        const maxBodyBytes = parseIntOption(options.maxBodyBytes, 'max-body-bytes');

        const redisHost = trimOption(options.redisHost);
        const redisPort = parseIntOption(options.redisPort, 'redis-port', 'non-negative');
        const redisPassword = options.redisPassword;
        const redisDb = parseIntOption(options.redisDb, 'redis-db', 'non-negative');

        const signingWindowMs = parseIntOption(options.signingWindowMs, 'signing-window-ms');

        await RedisProxyServer.start({
          host,
          port,
          maxBodyBytes,
          redisHost,
          redisPort,
          redisPassword,
          redisDb,
          requireSigning: options.requireSigning === true,
          keyId: options.keyId,
          secret: options.secret,
          signingWindowMs,
        });
      },
    });
  },
});

export default RedisProxyCommand;
