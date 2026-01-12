/**
 * make:notification-template
 * Scaffolds a notification markdown template into the project.
 */

import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { BaseCommand } from '@cli/BaseCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { PromptHelper } from '@cli/PromptHelper';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { TemplateGenerator } from '@cli/scaffolding/TemplateGenerator';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import type { Command } from 'commander';
import inquirer from 'inquirer';

type NotificationChannel = 'mail' | 'sms' | 'slack' | 'discord';

interface MakeNotificationTemplateOptions extends CommandOptions {
  channels?: string;
  vars?: string;
  smsVariant?: string;
  overwrite?: boolean;
  noInteractive?: boolean;
}

const addOptions = (command: Command): void => {
  command.argument('[name]', 'Template name (alphanumeric + hyphens only)');
  command.option('--channels <csv>', 'Comma-separated channels: mail,sms,slack,discord');
  command.option('--vars <csv>', 'Comma-separated variables');
  command.option('--sms-variant <mode>', 'short|none', 'none');
  command.option('--overwrite', 'Overwrite existing file');
  command.option('--no-interactive', 'Disable prompts (requires args/options)');
};

const defaultCopyright = (): string =>
  process.env['TEMPLATE_COPYRIGHT'] ?? '© 2025 Zintrust Framework. All rights reserved.';

const parseChannelsCsv = (csv: string | undefined): NotificationChannel[] => {
  if (csv === undefined || csv.trim() === '') return [];
  const parts = csv
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const out: NotificationChannel[] = [];
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === 'mail' || lower === 'sms' || lower === 'slack' || lower === 'discord') {
      if (!out.includes(lower as NotificationChannel)) out.push(lower as NotificationChannel);
    }
  }
  return out;
};

const resolveName = async (
  options: MakeNotificationTemplateOptions,
  interactive: boolean
): Promise<string> => {
  const argName = options.args?.[0];
  const name =
    argName ??
    (interactive ? await PromptHelper.textInput('Template name:', 'security-alert', true) : '');

  if (name.trim() === '') {
    throw ErrorFactory.createValidationError('Template name required');
  }

  return name;
};

const resolveChannels = async (
  options: MakeNotificationTemplateOptions,
  interactive: boolean
): Promise<NotificationChannel[]> => {
  let channels = parseChannelsCsv(options.channels);
  if (channels.length > 0) return channels;
  if (!interactive) return [];

  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'channels',
      message: 'Channels:',
      choices: ['mail', 'sms', 'slack', 'discord'],
      default: ['mail'],
    },
  ]);

  channels = (answer.channels as NotificationChannel[]) ?? ['mail'];
  return channels;
};

const resolveVariables = async (
  options: MakeNotificationTemplateOptions,
  interactive: boolean
): Promise<string[]> => {
  const varsCsv =
    options.vars ??
    (interactive
      ? await PromptHelper.textInput(
          'Variables (comma-separated):',
          'ipAddress,location,deviceName,reviewLink',
          true
        )
      : '');

  return TemplateGenerator.parseVariablesCsv(varsCsv);
};

const maybeEnableOverwrite = async (
  interactive: boolean,
  overwriteFlag: boolean,
  relPath: string
): Promise<boolean> => {
  if (!interactive || overwriteFlag) return overwriteFlag;

  const fullPath = path.join(process.cwd(), relPath);
  if (!FileGenerator.fileExists(fullPath)) return false;

  return PromptHelper.confirm('File exists. Overwrite?', false, true);
};

export const MakeNotificationTemplateCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'make:notification-template',
      aliases: 'make:notification',
      description: 'Scaffold a notification markdown template into src/notification/markdown',
      addOptions,
      execute: async (options: MakeNotificationTemplateOptions) => {
        const interactive = options.noInteractive !== true;

        const name = await resolveName(options, interactive);
        const channels = await resolveChannels(options, interactive);
        const variables = await resolveVariables(options, interactive);
        const smsVariant = (options.smsVariant ?? 'none') as 'short' | 'none';

        TemplateGenerator.ensureDirectories(process.cwd());

        const relPath = path.join('src', 'notification', 'markdown', `${name}.md`);
        const overwrite = await maybeEnableOverwrite(
          interactive,
          options.overwrite === true,
          relPath
        );

        const result = TemplateGenerator.scaffoldNotificationMarkdownTemplate({
          name,
          channels,
          variables,
          smsVariant,
          copyright: defaultCopyright(),
          projectRoot: process.cwd(),
          overwrite,
        });

        if (result.success) ErrorHandler.success(result.message);
        else ErrorHandler.warn(result.message);
      },
    });
  },
});

export default MakeNotificationTemplateCommand;
