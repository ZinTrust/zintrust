/**
 * make:mail-template
 * Scaffolds a mail markdown template into the project.
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { PromptHelper } from '@cli/PromptHelper';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { TemplateGenerator } from '@cli/scaffolding/TemplateGenerator';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';
import { Command } from 'commander';

type MailCategory = 'auth' | 'transactional' | 'notifications';

interface MakeMailTemplateOptions extends CommandOptions {
  category?: string;
  vars?: string;
  overwrite?: boolean;
  noInteractive?: boolean;
}

const addOptions = (command: Command): void => {
  command.argument('[name]', 'Template name (alphanumeric + hyphens only)');
  command.option('--category <category>', 'auth|transactional|notifications');
  command.option(
    '--vars <csv>',
    'Comma-separated variables (e.g., name,confirmLink,expiryMinutes)'
  );
  command.option('--overwrite', 'Overwrite existing file');
  command.option('--no-interactive', 'Disable prompts (requires args/options)');
};

const defaultCopyright = (): string =>
  process.env['TEMPLATE_COPYRIGHT'] ?? '© 2025 Zintrust Framework. All rights reserved.';

export const MakeMailTemplateCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'make:mail-template',
      description: 'Scaffold a mail markdown template into src/mail/markdown',
      addOptions,
      execute: async (options: MakeMailTemplateOptions) => {
        const interactive = options.noInteractive !== true;

        const argName = options.args?.[0];
        const name =
          argName ??
          (interactive ? await PromptHelper.textInput('Template name:', 'welcome', true) : '');

        if (name.trim() === '') {
          throw ErrorFactory.createValidationError('Template name required');
        }

        const categoryInput =
          options.category ??
          (interactive
            ? await PromptHelper.chooseFrom(
                'Category:',
                ['auth', 'transactional', 'notifications'],
                'auth',
                true
              )
            : 'auth');

        const category = categoryInput as MailCategory;

        const varsCsv =
          options.vars ??
          (interactive
            ? await PromptHelper.textInput(
                'Variables (comma-separated):',
                'name,confirmLink,expiryMinutes',
                true
              )
            : '');

        const variables = TemplateGenerator.parseVariablesCsv(varsCsv);

        TemplateGenerator.ensureDirectories(process.cwd());

        // If file exists and overwrite not specified, ask.
        const desired = {
          name,
          category,
          variables,
          copyright: defaultCopyright(),
          projectRoot: process.cwd(),
          overwrite: options.overwrite === true,
        };

        if (options.overwrite !== true && interactive) {
          const relPath = path.join('src', 'mail', 'markdown', category, `${name}.md`);
          const fullPath = path.join(process.cwd(), relPath);
          if (FileGenerator.fileExists(fullPath)) {
            const confirm = await PromptHelper.confirm('File exists. Overwrite?', false, true);
            if (confirm) {
              desired.overwrite = true;
            }
          }
        }

        const result = TemplateGenerator.scaffoldMailMarkdownTemplate(desired);

        if (result.success) {
          ErrorHandler.success(result.message);
          return;
        }

        ErrorHandler.warn(result.message);
      },
    });
  },
});

export default MakeMailTemplateCommand;
