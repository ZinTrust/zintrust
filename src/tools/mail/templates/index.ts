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
      text: 'Hi {{name}},\n\nWelcome to Zintrust.',
      html: '<p>Hi {{name}},</p><p>Welcome to Zintrust.</p>',
    } satisfies MailTemplate),
  }),
} satisfies MailTemplateRegistry);
