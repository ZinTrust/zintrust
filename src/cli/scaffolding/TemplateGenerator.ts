/**
 * Template Generator
 * Scaffolds mail and notification markdown templates into the application source.
 *
 * Notes:
 * - Generates into application folders (default: src/mail/markdown and src/notification/markdown)
 * - Uses FileGenerator for consistent file I/O + logging
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';

export type MailTemplateCategory = 'auth' | 'transactional' | 'notifications';
export type NotificationChannel = 'mail' | 'sms' | 'slack' | 'discord';

export interface MailTemplateScaffoldOptions {
  name: string;
  category: MailTemplateCategory;
  variables: string[];
  copyright: string;
  projectRoot: string;
  overwrite?: boolean;
}

export interface NotificationTemplateScaffoldOptions {
  name: string;
  channels: NotificationChannel[];
  variables: string[];
  copyright: string;
  projectRoot: string;
  smsVariant?: 'short' | 'none';
  overwrite?: boolean;
}

export interface TemplateScaffoldResult {
  success: boolean;
  filePath: string;
  message: string;
}

const normalizeList = (items: string[]): string[] => {
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    if (v === '') continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
};

export const TemplateGenerator = Object.freeze({
  validateTemplateName(name: string): void {
    const trimmed = name.trim();
    if (trimmed === '') {
      throw ErrorFactory.createValidationError('Template name cannot be empty');
    }

    // Alphanumeric + hyphens only (case-insensitive)
    const re = /^[a-z0-9-]+$/i;
    if (re.exec(trimmed) === null) {
      throw ErrorFactory.createValidationError(
        'Template name must be alphanumeric and may include hyphens only'
      );
    }
  },

  parseVariablesCsv(csv: string | undefined): string[] {
    if (csv === undefined || csv.trim() === '') return [];
    return normalizeList(csv.split(','));
  },

  scaffoldMailMarkdownTemplate(options: MailTemplateScaffoldOptions): TemplateScaffoldResult {
    this.validateTemplateName(options.name);

    const variables = normalizeList(options.variables);

    const relPath = path.join('src', 'mail', 'markdown', options.category, `${options.name}.md`);

    const filePath = path.join(options.projectRoot, relPath);

    const content = buildMailTemplateContent({
      name: options.name,
      category: options.category,
      variables,
      copyright: options.copyright,
    });

    const wrote = FileGenerator.writeFile(filePath, content, {
      overwrite: options.overwrite === true,
      createDirs: true,
    });

    if (!wrote) {
      return {
        success: false,
        filePath,
        message: `Template already exists (skipped): ${relPath}`,
      };
    }

    return {
      success: true,
      filePath,
      message: `Mail template created: ${relPath}`,
    };
  },

  scaffoldNotificationMarkdownTemplate(
    options: NotificationTemplateScaffoldOptions
  ): TemplateScaffoldResult {
    this.validateTemplateName(options.name);

    const variables = normalizeList(options.variables);
    const channels = normalizeList(options.channels);

    const relPath = path.join('src', 'notification', 'markdown', `${options.name}.md`);
    const filePath = path.join(options.projectRoot, relPath);

    const content = buildNotificationTemplateContent({
      name: options.name,
      channels,
      variables,
      smsVariant: options.smsVariant ?? 'none',
      copyright: options.copyright,
    });

    const wrote = FileGenerator.writeFile(filePath, content, {
      overwrite: options.overwrite === true,
      createDirs: true,
    });

    if (!wrote) {
      return {
        success: false,
        filePath,
        message: `Template already exists (skipped): ${relPath}`,
      };
    }

    return {
      success: true,
      filePath,
      message: `Notification template created: ${relPath}`,
    };
  },

  ensureDirectories(projectRoot: string): void {
    try {
      // These are app-side directories, created on-demand.
      FileGenerator.createDirectories(
        ['src/mail/markdown', 'src/notification/markdown'],
        projectRoot
      );
    } catch (error) {
      Logger.error('Failed to ensure template directories', error);
      throw ErrorFactory.createTryCatchError('Failed to ensure template directories', error);
    }
  },
});

const buildMailTemplateContent = (input: {
  name: string;
  category: MailTemplateCategory;
  variables: string[];
  copyright: string;
}): string => {
  const variablesLine = input.variables.length > 0 ? input.variables.join(', ') : '';

  const varHint =
    input.variables.length > 0 ? `<!-- Variables: ${variablesLine} -->\n` : '<!-- Variables: -->\n';

  const normalizedVars = normalizeList(input.variables);
  const hasName = normalizedVars.includes('name');
  const nonNameVars = normalizedVars.filter((v) => v !== 'name');

  const dataRows = normalizedVars.map((v) => `- **${v}:** {{${v}}}`).join('\n');
  const dataSection = normalizedVars.length > 0 ? `## Template Data\n\n${dataRows}\n\n` : '';

  const introLine = hasName ? 'Welcome, {{name}}!' : 'Welcome!';
  const exampleLinkVar = nonNameVars.find((v) => v.toLowerCase().includes('link'));
  const exampleExpiryVar = nonNameVars.find((v) => v.toLowerCase().includes('expiry'));

  const actionLine =
    exampleLinkVar === undefined
      ? 'Action link: (add your link here)'
      : `Action link: {{${exampleLinkVar}}}`;

  const expiryLine =
    exampleExpiryVar === undefined ? '' : `_This link expires in {{${exampleExpiryVar}}}._\n\n`;

  // Keep content intentionally minimal and copy-paste ready.
  // Developers can adjust links/layout and remove sections as needed.
  return `<!-- Mail Template: ${input.name} -->
<!-- Category: ${input.category} -->
<!-- Copyright: ${input.copyright} -->
${varHint}
# ${introLine}

Thanks for reaching out. This is a scaffolded markdown template.

${dataSection}## Next Steps

- ${actionLine}
- Customize the sections for your product

${expiryLine}---

Questions? Contact support.
`;
};

const buildNotificationTemplateContent = (input: {
  name: string;
  channels: string[];
  variables: string[];
  smsVariant: 'short' | 'none';
  copyright: string;
}): string => {
  const channelsLine = input.channels.length > 0 ? input.channels.join(', ') : '';
  const variablesLine = input.variables.length > 0 ? input.variables.join(', ') : '';

  const smsLine = input.smsVariant === 'short' ? '<!-- SMS Variant: short -->\n' : '';

  const normalizedVars = normalizeList(input.variables);

  const dataRows = normalizedVars.map((v) => `- **${v}:** {{${v}}}`).join('\n');
  const dataSection = normalizedVars.length > 0 ? `## Template Data\n\n${dataRows}\n\n` : '';

  const smsPreviewVars = normalizedVars.slice(0, 2);
  const smsPreview =
    smsPreviewVars.length > 0
      ? smsPreviewVars.map((v) => `${v}: {{${v}}}`).join(', ')
      : 'add variables as needed';

  const smsVariantBlock =
    input.smsVariant === 'short'
      ? `\n<!-- SMS Variant Start -->\n\n${input.name}: ${smsPreview}\n\n<!-- SMS Variant End -->\n`
      : '';

  return `<!-- Notification Template: ${input.name} -->
<!-- Copyright: ${input.copyright} -->
<!-- Channels: ${channelsLine} -->
<!-- Variables: ${variablesLine} -->
${smsLine}
# Notification: ${input.name}

This is a scaffolded notification template.

${dataSection}---

Add your message content here.
${smsVariantBlock}`;
};
