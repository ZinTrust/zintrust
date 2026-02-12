import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFile } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import { fileURLToPath, pathToFileURL } from '@node-singletons/url';

import { Env } from '@config/env';
import type { TemplateVariables } from '@mail/template-utils';
import { interpolate } from '@mail/template-utils';

const looksLikeHtml = (value: string): boolean => /<\s*html\b|<!doctype\b|<\s*body\b/i.test(value);

const getSafeCwd = (): string => {
  try {
    if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
      const cwd = process.cwd();
      if (typeof cwd === 'string' && cwd.trim() !== '') return cwd;
    }
  } catch {
    return '';
  }
  return '';
};

/**
 * Get the base directory for templates.
 * In Cloudflare Workers, import.meta.url may be undefined, so we handle that case.
 */
function getBaseDir(): string {
  try {
    // Check if import.meta.url is available (Node.js, Deno, modern bundlers)
    if (typeof import.meta.url === 'string' && import.meta.url.trim() !== '') {
      return dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // Fallback for environments where fileURLToPath fails
  }

  // Fallback: use cwd if available
  const cwd = getSafeCwd();
  if (cwd.trim() !== '') {
    return join(cwd, 'src', 'tools', 'mail');
  }

  // Last resort: return a relative path that might work
  return './src/tools/mail';
}

function resolveTemplatePath(templateName: string): string {
  const baseDir = getBaseDir();
  const isPath = templateName.includes('/') || templateName.endsWith('.html');

  if (!isPath) {
    return join(baseDir, 'templates', `${templateName}.html`);
  }

  if (templateName.startsWith('/')) {
    return templateName;
  }

  const cwd = getSafeCwd();
  return cwd.trim() === '' ? join(baseDir, templateName) : join(cwd, templateName);
}

async function loadTemplateContent(templateName: string): Promise<string> {
  const templatePath = resolveTemplatePath(templateName);
  const normalizedTemplate = templateName.endsWith('.html') ? templateName : `${templateName}.html`;
  const cwd = getSafeCwd();
  const baseDir = getBaseDir();

  const candidates = [
    templatePath,
    join(baseDir, 'templates', normalizedTemplate),
    join(cwd, 'dist', 'src', 'tools', 'mail', 'templates', normalizedTemplate),
    join(cwd, 'src', 'tools', 'mail', 'templates', normalizedTemplate),
  ].filter((path, index, arr) => path.trim() !== '' && arr.indexOf(path) === index);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await readFile(candidate, 'utf-8');
    } catch (error) {
      lastError = error;
    }
  }

  const normalizedModuleName = templateName.endsWith('.html')
    ? templateName.slice(0, -5)
    : templateName;
  const moduleCandidates = [
    join(cwd, 'dist', 'src', 'tools', 'mail', 'templates', `${normalizedModuleName}.js`),
    join(cwd, 'src', 'tools', 'mail', 'templates', `${normalizedModuleName}.ts`),
    join(baseDir, 'templates', `${normalizedModuleName}.js`),
    join(baseDir, 'templates', `${normalizedModuleName}.ts`),
  ].filter((path, index, arr) => path.trim() !== '' && arr.indexOf(path) === index);

  for (const modulePath of moduleCandidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const imported = (await import(pathToFileURL(modulePath).href)) as { default?: unknown };
      if (typeof imported.default === 'string' && imported.default.trim() !== '') {
        return imported.default;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw ErrorFactory.createConfigError(
    `Failed to load template from known paths: ${[...candidates, ...moduleCandidates].join(', ')}` +
      (lastError === undefined ? '' : `. Last error: ${String(lastError)}`)
  );
}

/**
 * Load and render email template with variable substitution
 */
export async function loadTemplate(
  templateName: string,
  variables: TemplateVariables = {}
): Promise<string> {
  try {
    const template = looksLikeHtml(templateName)
      ? templateName
      : await loadTemplateContent(templateName);

    // Replace variables using shared interpolate util
    const mergedVars: TemplateVariables = {
      year: new Date().getFullYear().toString(),
      APP_NAME: Env.APP_NAME ?? 'ZinTrust',
      ...variables,
    };
    let rendered = interpolate(template, mergedVars);

    // Handle conditional blocks {{#if_condition}}...{{/if_condition}}
    rendered = renderConditionals(rendered, variables);

    // Handle loops {{#each_array}}...{{/each_array}}
    rendered = renderLoops(rendered, variables);

    return rendered;
  } catch (error) {
    throw ErrorFactory.createConfigError(`Failed to load template ${templateName}: ${error}`);
  }
}

/**
 * Render conditional blocks {{#if_condition}}...{{/if_condition}}
 */
function renderConditionals(template: string, variables: TemplateVariables): string {
  const conditionalRegex = /{{#if_(\w+)}}(.+?){{\/if_\1}}/gs;

  return template.replaceAll(
    conditionalRegex,
    (_fullMatch: string, condition: string, content: string): string => {
      const value = variables[condition];

      if (value === true || value === 'true') {
        return content;
      }

      return '';
    }
  );
}

/**
 * Render loop blocks {{#each_array}}...{{/each_array}}
 */
function renderLoops(template: string, variables: TemplateVariables): string {
  const loopRegex = /{{#each_(\w+)}}(.+?){{\/each_\1}}/gs;

  return template.replaceAll(
    loopRegex,
    (_fullMatch: string, arrayName: string, content: string): string => {
      const array = variables[arrayName] as unknown[] | undefined;

      if (!Array.isArray(array)) {
        return '';
      }

      return array
        .map((item): string => {
          let rendered = content;

          if (typeof item === 'object' && item !== null) {
            for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
              const regex = new RegExp(`{{${key}}}`, 'g');
              rendered = rendered.replaceAll(regex, String(value ?? ''));
            }
          }

          return rendered;
        })
        .join('');
    }
  );
}

/**
 * Get list of available templates
 */
export function getAvailableTemplates(): string[] {
  return [
    'welcome.html',
    'password-reset.html',
    'job-completed.html',
    'worker-alert.html',
    'performance-report.html',
    'general.html',
  ];
}
