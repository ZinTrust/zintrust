/**
 * Mail Templates (Core)
 *
 * This folder contains reusable email templates used by core mail tooling.
 * Templates may be organized into subfolders (e.g., `auth/`, `orders/`) with
 * both rich HTML and plain-text variants.
 */

export type MailTemplate = {
  subject: string;
  text: string;
  html?: string;
};

export type MailTemplateRegistry = Record<string, unknown>;

const renderString = (template: string, data: Record<string, unknown>): string => {
  let out = template;
  for (const [key, value] of Object.entries(data)) {
    const replacement = value === null || value === undefined ? '' : String(value);
    out = out.replaceAll(new RegExp(String.raw`{{\s*${key}\s*}}`, 'g'), replacement);
  }
  return out;
};

export const MailTemplateRenderer = Object.freeze({
  renderString,

  render(template: MailTemplate, data: Record<string, unknown>): MailTemplate {
    return {
      subject: renderString(template.subject, data),
      text: renderString(template.text, data),
      html: typeof template.html === 'string' ? renderString(template.html, data) : undefined,
    };
  },
});

export const MailTemplates = Object.freeze({
  auth: Object.freeze({
    // Example template. Apps can add their own workflows under app/Toolkit/Mail.
    welcome: Object.freeze({
      subject: 'Welcome, {{name}}!',
      text: 'Hi {{name}},\n\nWelcome to ZinTrust.',
      html: '<p>Hi {{name}},</p><p>Welcome to ZinTrust.</p>',
    } satisfies MailTemplate),
  }),
} satisfies MailTemplateRegistry);

import { ErrorFactory } from '@/exceptions/ZintrustError';
/**
 * Markdown template compatibility exports
 * Mail templates are now pure HTML files.
 * These exports provide backward compatibility for CLI and node.ts exports.
 */

import { readdirSync, readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export interface MarkdownTemplateMetadata {
  subject?: string;
  preheader?: string;
  variables?: string[];
  content: string;
}

export interface MarkdownRenderResult {
  html: string;
  meta: {
    subject?: string;
    content: string;
    variables?: string[];
  };
}

/**
 * List all available HTML mail templates.
 * Returns template names without the .html extension.
 */
export function listTemplates(): string[] {
  try {
    const templatesDir = join(process.cwd(), 'src/tools/mail/templates');
    const files = readdirSync(templatesDir);
    return files
      .filter((file) => file.endsWith('.html'))
      .map((file) => file.replace('.html', ''))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * Load a mail template by name.
 * Note: HTML templates don't have embedded metadata like markdown templates did.
 * This function returns the raw HTML content.
 */
export function loadTemplate(name: string): MarkdownTemplateMetadata {
  try {
    const templatesDir = join(process.cwd(), 'src/tools/mail/templates');
    const filePath = join(templatesDir, `${name}.html`);
    const content = readFileSync(filePath, 'utf8');

    return {
      subject: undefined,
      preheader: undefined,
      variables: undefined,
      content,
    };
  } catch (error) {
    throw ErrorFactory.createTryCatchError(
      `Template "${name}" not found: ${(error as Error).message}`
    );
  }
}

/**
 * Render a mail template with variables.
 * Note: This is a compatibility function. For production use, use MailTemplateRenderer instead.
 */
export function renderTemplate(
  name: string,
  variables?: Record<string, unknown>
): MarkdownRenderResult {
  const template = loadTemplate(name);
  let html = template.content;

  // Simple variable interpolation
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(String.raw`{{\s*${key}\s*}}`, 'g');
      html = html.replace(regex, String(value ?? ''));
    }
  }

  return {
    html,
    meta: {
      subject: template.subject,
      content: template.content,
      variables: template.variables,
    },
  };
}
