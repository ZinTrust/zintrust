import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { Command } from 'commander';

type ProxyOptions = Record<string, unknown>;

type BuildServer = {
  host: string;
  port: number;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPass: string;
  connectionLimit: number;
  keyId: string;
  secret: string;
  requireSigning: boolean;
  signingWindowMs: number;
};

const startWatchMode = async (options: ProxyOptions): Promise<void> => {
  Logger.info('Starting SQL Server proxy in watch mode...');
  const { watch } = await import('node:fs');
  const { spawn } = await import('node:child_process');

  let child: ReturnType<typeof spawn> | null = null;

  const startProxy = (): void => {
    if (child) {
      child.kill();
    }
    const args = ['run', 'cli', 'proxy:sqlserver'];
    Object.entries(options).forEach(([key, value]) => {
      if (key !== 'watch' && value !== undefined) {
        args.push(`--${key}`, String(value));
      }
    });
    child = spawn('npm', args, { stdio: 'inherit' });
  };

  const watcher = watch('./src', { recursive: true }, (_eventType, filename) => {
    if (
      filename !== null &&
      filename.length > 0 &&
      (filename.endsWith('.ts') || filename.endsWith('.js'))
    ) {
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

export const SqlServerProxyCommand = Object.freeze({
  create(): Command {
    const cmd = new Command('proxy:sqlserver');
    cmd.description('Start SQL Server HTTP proxy server');

    const configureOptions = (): void => {
      cmd.option('--host <host>', 'Proxy host', Env.get('SQLSERVER_PROXY_HOST', '127.0.0.1'));
      cmd.option('--port <port>', 'Proxy port', String(Env.getInt('SQLSERVER_PROXY_PORT', 8793)));
      cmd.option('--db-host <host>', 'SQL Server host', Env.get('DB_HOST_MSSQL', '127.0.0.1'));
      cmd.option('--db-port <port>', 'SQL Server port', String(Env.getInt('DB_PORT_MSSQL', 1433)));
      cmd.option('--db-name <name>', 'Database name', Env.get('DB_DATABASE_MSSQL', 'zintrust'));
      cmd.option('--db-user <user>', 'Database user', Env.get('DB_USERNAME_MSSQL', 'sa'));
      cmd.option('--db-pass <pass>', 'Database password', Env.get('DB_PASSWORD_MSSQL', ''));
      cmd.option(
        '--connection-limit <limit>',
        'Connection pool limit',
        String(Env.getInt('SQLSERVER_PROXY_POOL_LIMIT', 10))
      );
      cmd.option(
        '--key-id <keyId>',
        'Signing key ID',
        Env.get('SQLSERVER_PROXY_KEY_ID', 'default')
      );
      cmd.option('--secret <secret>', 'Signing secret', Env.get('SQLSERVER_PROXY_SECRET', ''));
      cmd.option(
        '--require-signing',
        'Require request signing',
        Env.SQLSERVER_PROXY_REQUIRE_SIGNING
      );
      cmd.option(
        '--signing-window-ms <ms>',
        'Signing window in milliseconds',
        String(Env.getInt('SQLSERVER_PROXY_SIGNING_WINDOW_MS', 60000))
      );
      cmd.option('--watch', 'Watch mode: restart on file changes');
    };

    const buildServerConfig = (options: ProxyOptions): BuildServer => ({
      host: String(options['host']),
      port: Number(options['port']),
      dbHost: String(options['dbHost']),
      dbPort: Number(options['dbPort']),
      dbName: String(options['dbName']),
      dbUser: String(options['dbUser']),
      dbPass: String(options['dbPass']),
      connectionLimit: Number(options['connectionLimit']),
      keyId: String(options['keyId']),
      secret: String(options['secret']),
      requireSigning: Boolean(options['requireSigning']),
      signingWindowMs: Number(options['signingWindowMs']),
    });

    const startNormalMode = async (options: ProxyOptions): Promise<void> => {
      const { SqlServerProxyServer } = await import('@proxy/sqlserver/SqlServerProxyServer');
      await SqlServerProxyServer.start(buildServerConfig(options));
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
