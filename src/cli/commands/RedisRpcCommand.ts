import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import {
  ensureProxyEnvLoadedForCwd,
  maybeRunProxyWatchMode,
  parseIntOption,
  trimOption,
} from '@cli/commands/ProxyCommandUtils';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type RedisRpcOptions = CommandOptions & {
  host?: string;
  port?: string;
  secret?: string;
  prefix?: string;
  redisHost?: string;
  redisPort?: string;
  redisPassword?: string;
  redisDb?: string;
  watch?: boolean;
};

type RedisRpcServerModule = {
  listenRedisRpcServer: (options?: Record<string, unknown>) => Promise<{
    backend: { close: () => Promise<void> };
    server: { close: (callback?: () => void) => void };
    settings: { host: string; port: number };
  }>;
};

type RedisRpcServerOptions = Record<string, unknown>;

const REDIS_RPC_SERVER_PACKAGE = '@zintrust/redis-rpc/server';

const addOptions = (command: Command): void => {
  ensureProxyEnvLoadedForCwd();

  command.option('--host <host>', 'Host to bind', Env.get('REDIS_RPC_HOST', '127.0.0.1'));
  command.option('--port <port>', 'Port to bind', String(Env.getInt('REDIS_RPC_PORT', 8794)));
  command.option('--secret <secret>', 'Shared RPC secret', Env.get('REDIS_RPC_SECRET', ''));
  command.option('--prefix <prefix>', 'BullMQ key prefix', Env.get('REDIS_RPC_BULLMQ_PREFIX', ''));
  command.option('--watch', 'Auto-restart Redis RPC server on file changes');

  command.option('--redis-host <host>', 'Redis host');
  command.option('--redis-port <port>', 'Redis port');
  command.option('--redis-password <password>', 'Redis password');
  command.option('--redis-db <db>', 'Redis database');
};

const resolveRedisOptions = (options: RedisRpcOptions): Record<string, unknown> | undefined => {
  const redisHost = trimOption(options.redisHost);
  const redisPort = parseIntOption(options.redisPort, 'redis-port', 'non-negative');
  const redisPassword = options.redisPassword;
  const redisDb = parseIntOption(options.redisDb, 'redis-db', 'non-negative');

  if (
    redisHost === undefined &&
    redisPort === undefined &&
    redisPassword === undefined &&
    redisDb === undefined
  ) {
    return undefined;
  }

  const password =
    redisPassword ?? Env.get('REDIS_RPC_REDIS_PASSWORD', Env.get('REDIS_PASSWORD', ''));

  return {
    host: redisHost ?? Env.get('REDIS_RPC_REDIS_HOST', Env.get('REDIS_HOST', '127.0.0.1')),
    port: redisPort ?? Env.getInt('REDIS_RPC_REDIS_PORT', Env.getInt('REDIS_PORT', 6379)),
    password: password || undefined,
    db: redisDb ?? Env.getInt('REDIS_RPC_REDIS_DB', Env.getInt('REDIS_QUEUE_DB', Env.REDIS_DB)),
    maxRetriesPerRequest: null,
  };
};

const loadRedisRpcServer = async (): Promise<RedisRpcServerModule> => {
  try {
    return (await import(REDIS_RPC_SERVER_PACKAGE)) as unknown as RedisRpcServerModule;
  } catch (error) {
    throw ErrorFactory.createCliError(
      'Install @zintrust/redis-rpc to use `zin redis-rpc` or `zin s redis-rpc`.',
      error
    );
  }
};

const setDefinedOption = (
  target: RedisRpcServerOptions,
  key: string,
  value: unknown
): void => {
  if (value === undefined) return;
  target[key] = value;
};

const waitForShutdown = async (
  created: Awaited<ReturnType<RedisRpcServerModule['listenRedisRpcServer']>>
): Promise<never> => {
  await new Promise<void>((resolve) => {
    const shutdown = async (): Promise<void> => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      await created.backend.close();
      created.server.close(resolve);
    };
    const onSignal = (): void => {
      void shutdown();
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });

  process.exit(0);
};

export const RedisRpcCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'redis-rpc',
      aliases: ['rpc:redis'],
      description: 'Start the Redis RPC server for queue, worker, monitor, and Redis operations',
      addOptions,
      execute: async (options: RedisRpcOptions) => {
        await maybeRunProxyWatchMode(options.watch);

        const mod = await loadRedisRpcServer();
        const host = trimOption(options.host);
        const port = parseIntOption(options.port, 'port');
        const secret = trimOption(options.secret);
        const prefix = trimOption(options.prefix);
        const redis = resolveRedisOptions(options);
        const serverOptions: RedisRpcServerOptions = {};

        setDefinedOption(serverOptions, 'host', host);
        setDefinedOption(serverOptions, 'port', port);
        setDefinedOption(serverOptions, 'secret', secret);
        setDefinedOption(serverOptions, 'prefix', prefix);
        setDefinedOption(serverOptions, 'redis', redis);

        const created = await mod.listenRedisRpcServer(serverOptions);

        Logger.info(
          `Redis RPC server listening on http://${created.settings.host}:${created.settings.port}`
        );
        await waitForShutdown(created);
      },
    });
  },
});

export default RedisRpcCommand;
