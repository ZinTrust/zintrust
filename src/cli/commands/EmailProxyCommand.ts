import type { IBaseCommand } from '@cli/BaseCommand';
import { findQuotedValue, trimNonEmptyOption } from '@cli/commands/ProxyScaffoldUtils';
import {
  createWranglerProxyCommand,
  type WranglerProxyCommandOptions,
} from '@cli/commands/WranglerProxyCommandUtils';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { Command } from 'commander';

type EmailProxyCommandOptions = WranglerProxyCommandOptions & {
  binding?: string;
  destinationAddress?: string;
  allowedDestinationAddresses?: string;
  allowedSenderAddresses?: string;
};

type EmailProxyConfigValues = {
  binding: string;
  destinationAddress?: string;
  allowedDestinationAddresses?: string[];
  allowedSenderAddresses?: string[];
};

const DEFAULT_CONFIG = 'wrangler.jsonc';
const DEFAULT_COMPATIBILITY_DATE = '2026-03-12';
const DEFAULT_BINDING = 'SEND_EMAIL';
const DEFAULT_ENTRY_FILE = 'src/proxy/email/ZintrustEmailProxy.ts';
const DEFAULT_ROUTE_PATTERN = 'email-proxy.example.com';
const CORE_PROXY_MODULE = ['@zintrust', 'core', 'proxy'].join('/');

const parseCsv = (value: string | undefined): string[] | undefined => {
  const parsed = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item !== '' && items.indexOf(item) === index);

  return parsed.length === 0 ? undefined : parsed;
};

const renderArray = (values: string[]): string => {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
};

const resolveConfigValues = (
  content: string | undefined,
  options: EmailProxyCommandOptions
): EmailProxyConfigValues => {
  const fileContent = content ?? '';

  return {
    binding:
      trimNonEmptyOption(options.binding) ??
      trimNonEmptyOption(Env.get('MAIL_CLOUDFLARE_BINDING', '')) ??
      findQuotedValue(fileContent, 'MAIL_CLOUDFLARE_BINDING') ??
      findQuotedValue(fileContent, 'name') ??
      DEFAULT_BINDING,
    destinationAddress:
      trimNonEmptyOption(options.destinationAddress) ??
      trimNonEmptyOption(findQuotedValue(fileContent, 'destination_address')),
    allowedDestinationAddresses:
      parseCsv(options.allowedDestinationAddresses) ??
      parseCsv(Env.get('MAIL_CLOUDFLARE_ALLOWED_DESTINATION_ADDRESSES', '')),
    allowedSenderAddresses:
      parseCsv(options.allowedSenderAddresses) ??
      parseCsv(Env.get('MAIL_CLOUDFLARE_ALLOWED_SENDER_ADDRESSES', '')),
  };
};

const renderSendEmailBinding = (values: EmailProxyConfigValues): string[] => {
  const lines = ['        {', `          "name": "${values.binding}"`];

  if (values.destinationAddress !== undefined) {
    lines.push(`          ,"destination_address": "${values.destinationAddress}"`);
  }

  if (values.allowedDestinationAddresses !== undefined) {
    lines.push(
      `          ,"allowed_destination_addresses": ${renderArray(values.allowedDestinationAddresses)}`
    );
  }

  if (values.allowedSenderAddresses !== undefined) {
    lines.push(
      `          ,"allowed_sender_addresses": ${renderArray(values.allowedSenderAddresses)}`
    );
  }

  lines.push('        }');
  return lines;
};

const renderEmailProxyEnvBlock = (values: EmailProxyConfigValues): string => {
  return [
    '    "email-proxy": {',
    '      "name": "zintrust-email-proxy",',
    '      "main": "./src/proxy/email/ZintrustEmailProxy.ts",',
    '      "compatibility_flags": ["nodejs_compat"],',
    `      "compatibility_date": "${DEFAULT_COMPATIBILITY_DATE}",`,
    '      "vars": {',
    `        "MAIL_CLOUDFLARE_BINDING": "${values.binding}",`,
    '        "ZT_PROXY_SIGNING_WINDOW_MS": "60000",',
    '        "ZT_MAX_BODY_BYTES": "131072",',
    '        "NODE_ENV": "development"',
    '      },',
    '      "send_email": [',
    ...renderSendEmailBinding(values),
    '      ],',
    '      // Add routes here when ready:',
    `      // "routes": [{ "pattern": "${DEFAULT_ROUTE_PATTERN}", "custom_domain": true }]`,
    '    }',
  ].join('\n');
};

const warnOnMissingSigningSecret = (): void => {
  const directSecret = trimNonEmptyOption(Env.get('MAIL_CLOUDFLARE_PROXY_SECRET', ''));
  const fallbackSecret = trimNonEmptyOption(Env.get('APP_KEY', ''));
  if (directSecret !== undefined || fallbackSecret !== undefined) return;

  Logger.warn(
    'Email proxy signing will fail: the resolved project env does not expose MAIL_CLOUDFLARE_PROXY_SECRET or APP_KEY to the Worker runtime. Signed requests will be rejected with 401 CONFIG_ERROR until one of those keys is set.'
  );
};

const addOptions = (command: Command): void => {
  command.option('-c, --config <path>', 'Wrangler config file', DEFAULT_CONFIG);
  command.option('--port <port>', 'Local Wrangler dev port', '5777');
  command.option('--watch', 'Auto-restart proxy on file changes');
  command.option('--binding <name>', 'send_email binding name', DEFAULT_BINDING);
  command.option('--destination-address <email>', 'Restrict the binding to one destination');
  command.option(
    '--allowed-destination-addresses <emails>',
    'Comma-separated allowlist of destination addresses'
  );
  command.option(
    '--allowed-sender-addresses <emails>',
    'Comma-separated allowlist of sender addresses'
  );
};

export const EmailProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return createWranglerProxyCommand<EmailProxyConfigValues, EmailProxyCommandOptions>({
      name: 'proxy:email',
      aliases: ['email:proxy', 'proxy:cl:mail', 'proxy:cloudflare:mail'],
      description:
        'Start the local Cloudflare email proxy Worker via Wrangler and scaffold env.email-proxy in wrangler.jsonc when missing',
      envName: 'email-proxy',
      defaultPort: 5777,
      defaultConfig: DEFAULT_CONFIG,
      compatibilityDate: DEFAULT_COMPATIBILITY_DATE,
      entryFile: DEFAULT_ENTRY_FILE,
      exportName: 'ZintrustEmailProxy',
      moduleSpecifier: CORE_PROXY_MODULE,
      addOptions,
      resolveValues: resolveConfigValues,
      renderEnvBlock: renderEmailProxyEnvBlock,
      afterConfigResolved: warnOnMissingSigningSecret,
    });
  },
});

export default EmailProxyCommand;
