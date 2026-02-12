import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import { SmtpProxyServer } from '@proxy/smtp/SmtpProxyServer';
import type { Command } from 'commander';

type SmtpProxyOptions = CommandOptions & {
  host?: string;
  port?: string;
  maxBodyBytes?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpSecure?: string;
  requireSigning?: boolean;
  keyId?: string;
  secret?: string;
  signingWindowMs?: string;
  watch?: boolean;
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
  command.option('--host <host>', 'Host to bind', Env.get('SMTP_PROXY_HOST', '127.0.0.1'));
  command.option('--port <port>', 'Port to bind', String(Env.getInt('SMTP_PROXY_PORT', 8794)));
  command.option(
    '--max-body-bytes <bytes>',
    'Max request size in bytes',
    String(Env.getInt('SMTP_PROXY_MAX_BODY_BYTES', 131072))
  );
  command.option('--watch', 'Auto-restart proxy on file changes');

  command.option('--smtp-host <host>', 'SMTP host');
  command.option('--smtp-port <port>', 'SMTP port');
  command.option('--smtp-username <user>', 'SMTP username');
  command.option('--smtp-password <password>', 'SMTP password');
  command.option('--smtp-secure <mode>', "SMTP secure: true, false, or 'starttls'");

  command.option(
    '--require-signing',
    'Require signed requests',
    Env.getBool('SMTP_PROXY_REQUIRE_SIGNING', true)
  );
  command.option('--key-id <id>', 'Signing key id', Env.get('SMTP_PROXY_KEY_ID', ''));
  command.option('--secret <secret>', 'Signing secret', Env.get('SMTP_PROXY_SECRET', ''));
  command.option(
    '--signing-window-ms <ms>',
    'Signing time window in ms',
    String(Env.getInt('SMTP_PROXY_SIGNING_WINDOW_MS', 60000))
  );
};

const isWatchChild = (): boolean => process.env['ZINTRUST_PROXY_WATCH_CHILD'] === '1';

const buildWatchArgs = (): string[] => {
  const rawArgs = process.argv.slice(2);
  const filtered = rawArgs.filter((arg) => arg !== '--watch');
  return ['watch', path.join('bin', 'zin.ts'), ...filtered];
};

export const SmtpProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'proxy:smtp',
      aliases: ['smtp:proxy', 'smtp-proxy', 'proxy:mail'],
      description: 'Start the SMTP HTTP proxy for Cloudflare Workers',
      addOptions,
      execute: async (options: SmtpProxyOptions) => {
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

        const smtpHost = options.smtpHost?.trim();
        const smtpPort = parseIntOption(options.smtpPort, 'smtp-port');
        const smtpUsername = options.smtpUsername?.trim();
        const smtpPassword = options.smtpPassword;
        const smtpSecure = options.smtpSecure;

        const signingWindowMs = parseIntOption(options.signingWindowMs, 'signing-window-ms');

        await SmtpProxyServer.start({
          host,
          port,
          maxBodyBytes,
          smtpHost,
          smtpPort,
          smtpUsername,
          smtpPassword,
          smtpSecure,
          requireSigning: options.requireSigning === true,
          keyId: options.keyId,
          secret: options.secret,
          signingWindowMs,
        });
      },
    });
  },
});

export default SmtpProxyCommand;
