import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
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

const parseIntOption = (raw: string | undefined, name: string): number | undefined => {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw ErrorFactory.createCliError(
      `Invalid --${name} '${raw}'. Expected a non-negative number.`
    );
  }
  return parsed;
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

const isWatchChild = (): boolean => process.env['ZINTRUST_PROXY_WATCH_CHILD'] === '1';

const buildWatchArgs = (): string[] => {
  const rawArgs = process.argv.slice(2);
  const filtered = rawArgs.filter((arg) => arg !== '--watch');
  return ['watch', path.join('bin', 'zin.ts'), ...filtered];
};

export const RedisProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:redis',
      aliases: ['redis:proxy', 'redis-proxy', 'proxy:red'],
      description: 'Start the Redis HTTP proxy for Cloudflare Workers',
      addOptions,
      execute: async (options: RedisProxyOptions) => {
        if (options.watch === true && !isWatchChild()) {
          const args = buildWatchArgs();
          const exitCode = await SpawnUtil.spawnAndWait({
            command: 'tsx',
            args,
            env: {
              ...process.env,
              ZINTRUST_PROXY_WATCH_CHILD: '1',
            },
            forwardSignals: false,
          });
          process.exit(exitCode);
        }

        const host = options.host?.trim();
        const port = parseIntOption(options.port, 'port');
        const maxBodyBytes = parseIntOption(options.maxBodyBytes, 'max-body-bytes');

        const redisHost = options.redisHost?.trim();
        const redisPort = parseIntOption(options.redisPort, 'redis-port');
        const redisPassword = options.redisPassword;
        const redisDb = parseIntOption(options.redisDb, 'redis-db');

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
