import type { CommandOptions } from '@cli/BaseCommand';
import {
  maybeRunProxyWatchMode,
  parseIntOption,
  trimOption,
} from '@cli/commands/ProxyCommandUtils';
import type { Command } from 'commander';

export type SqlProxyCommandOptions = CommandOptions & {
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
  watch?: boolean;
};

export type ParsedSqlProxyStartOptions = {
  host: string | undefined;
  port: number | undefined;
  maxBodyBytes: number | undefined;
  dbHost: string | undefined;
  dbPort: number | undefined;
  dbName: string | undefined;
  dbUser: string | undefined;
  dbPass: string | undefined;
  connectionLimit: number | undefined;
  requireSigning: boolean;
  keyId: string | undefined;
  secret: string | undefined;
  signingWindowMs: number | undefined;
};

export const addSqlProxyOptions = (
  command: Command,
  input: {
    hostDefault: string;
    portDefault: number;
    maxBodyBytesDefault: number;
    dbVendorLabel: string;
    requireSigningDefault: boolean;
    keyIdDefault: string;
    secretDefault: string;
    signingWindowMsDefault: number;
  }
): void => {
  command.option('--host <host>', 'Host to bind', input.hostDefault);
  command.option('--port <port>', 'Port to bind', String(input.portDefault));
  command.option(
    '--max-body-bytes <bytes>',
    'Max request size in bytes',
    String(input.maxBodyBytesDefault)
  );
  command.option('--watch', 'Auto-restart proxy on file changes');

  command.option('--db-host <host>', `${input.dbVendorLabel} host`);
  command.option('--db-port <port>', `${input.dbVendorLabel} port`);
  command.option('--db-name <name>', `${input.dbVendorLabel} database`);
  command.option('--db-user <user>', `${input.dbVendorLabel} username`);
  command.option('--db-pass <pass>', `${input.dbVendorLabel} password`);
  command.option('--connection-limit <max>', `${input.dbVendorLabel} connection pool limit`);

  command.option('--require-signing', 'Require signed requests', input.requireSigningDefault);
  command.option('--key-id <id>', 'Signing key id', input.keyIdDefault);
  command.option('--secret <secret>', 'Signing secret', input.secretDefault);
  command.option(
    '--signing-window-ms <ms>',
    'Signing time window in ms',
    String(input.signingWindowMsDefault)
  );
};

export const parseSqlProxyStartOptions = (
  options: SqlProxyCommandOptions
): ParsedSqlProxyStartOptions => {
  const host = trimOption(options.host);
  const port = parseIntOption(options.port, 'port');
  const maxBodyBytes = parseIntOption(options.maxBodyBytes, 'max-body-bytes');

  const dbHost = trimOption(options.dbHost);
  const dbPort = parseIntOption(options.dbPort, 'db-port');
  const dbName = trimOption(options.dbName);
  const dbUser = trimOption(options.dbUser);
  const dbPass = options.dbPass;

  const connectionLimit = parseIntOption(options.connectionLimit, 'connection-limit');
  const signingWindowMs = parseIntOption(options.signingWindowMs, 'signing-window-ms');

  return {
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
  };
};

export const runSqlProxyCommand = async (
  options: SqlProxyCommandOptions,
  start: (input: ReturnType<typeof parseSqlProxyStartOptions>) => Promise<void>
): Promise<void> => {
  await maybeRunProxyWatchMode(options.watch);
  await start(parseSqlProxyStartOptions(options));
};
