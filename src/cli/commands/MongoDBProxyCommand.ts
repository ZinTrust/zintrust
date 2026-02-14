import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Command } from 'commander';

type ProxyOptions = Record<string, unknown>;

const startWatchMode = async (options: ProxyOptions): Promise<void> => {
  Logger.info('Starting MongoDB proxy in watch mode...');
  const { watch } = await import('node:fs');
  const { spawn } = await import('node:child_process');

  let child: ReturnType<typeof spawn> | null = null;

  const optionFlagMap: Record<string, string> = {
    host: '--host',
    port: '--port',
    mongoUri: '--mongo-uri',
    mongoDb: '--mongo-db',
    keyId: '--key-id',
    secret: '--secret',
    requireSigning: '--require-signing',
    signingWindowMs: '--signing-window-ms',
  };

  const startProxy = (): void => {
    if (child) {
      child.kill();
    }
    const args = ['run', 'cli', 'proxy:mongodb'];
    Object.entries(options).forEach(([key, value]) => {
      if (key !== 'watch') {
        const flag = optionFlagMap[key] ?? `--${key}`;
        if (typeof value === 'boolean') {
          if (value) {
            args.push(flag);
          }
          return;
        }
        if (value !== undefined && value !== null) {
          args.push(flag, String(value));
        }
      }
    });
    child = spawn('npm', args, { stdio: 'inherit' });
  };

  const watcher = watch('./src', { recursive: true }, (_eventType, filename) => {
    if (filename !== null && (filename.endsWith('.ts') || filename.endsWith('.js'))) {
      Logger.info(`File changed: ${String(filename)}, restarting proxy...`);
      startProxy();
    }
  });

  startProxy();

  process.on('SIGINT', () => {
    watcher.close();
    if (child) child.kill();
    process.exit(0);
  });
};

export const MongoDBProxyCommand = Object.freeze({
  create(): Command {
    const cmd = new Command('proxy:mongodb');
    cmd.description('Start MongoDB HTTP proxy server');

    const configureOptions = (): void => {
      cmd.option('--host <host>', 'Proxy host', Env.get('MONGODB_PROXY_HOST', '127.0.0.1'));
      cmd.option('--port <port>', 'Proxy port', String(Env.getInt('MONGODB_PROXY_PORT', 8792)));
      cmd.option('--mongo-uri <uri>', 'MongoDB connection URI', Env.get('MONGO_URI', ''));
      cmd.option('--mongo-db <database>', 'MongoDB database name', Env.get('MONGO_DB', ''));
      cmd.option('--key-id <keyId>', 'Signing key ID', Env.get('MONGODB_PROXY_KEY_ID', 'default'));
      cmd.option('--secret <secret>', 'Signing secret', Env.get('MONGODB_PROXY_SECRET', ''));
      cmd.option('--require-signing', 'Require request signing', Env.MONGODB_PROXY_REQUIRE_SIGNING);
      cmd.option(
        '--signing-window-ms <ms>',
        'Signing window in milliseconds',
        String(Env.getInt('MONGODB_PROXY_SIGNING_WINDOW_MS', 60000))
      );
      cmd.option('--watch', 'Watch mode: restart on file changes');
    };

    const buildServerConfig = (
      options: ProxyOptions
    ): {
      host: string;
      port: number;
      mongoUri: string;
      mongoDb: string;
      keyId: string;
      secret: string;
      requireSigning: boolean;
      signingWindowMs: number;
    } => ({
      host: String(options['host']),
      port: Number(options['port']),
      mongoUri: String(options['mongoUri']),
      mongoDb: String(options['mongoDb']),
      keyId: String(options['keyId']),
      secret: String(options['secret']),
      requireSigning: Boolean(options['requireSigning']),
      signingWindowMs: Number(options['signingWindowMs']),
    });

    const startNormalMode = async (options: ProxyOptions): Promise<void> => {
      const { MongoDBProxyServer } = await import('@proxy/mongodb/MongoDBProxyServer');

      if (options['mongoUri'] === undefined || options['mongoDb'] === undefined) {
        throw ErrorFactory.createValidationError(
          'MongoDB URI and database name are required. Set MONGO_URI and MONGO_DB or pass --mongo-uri and --mongo-db'
        );
      }

      await MongoDBProxyServer.start(buildServerConfig(options));
    };

    const execute = async (options: ProxyOptions): Promise<void> => {
      if (options['watch'] === true) {
        await startWatchMode(options);
        return;
      }

      await startNormalMode(options);
    };

    configureOptions();
    cmd.action(execute);

    return cmd;
  },
});
