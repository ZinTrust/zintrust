import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFile } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import { fileURLToPath, pathToFileURL } from '@node-singletons/url';

import { Env } from '@config/env';
import type { TemplateVariables } from '@mail/template-utils';
import { interpolate } from '@mail/template-utils';

const looksLikeHtml = (value: string): boolean => /<\s*html\b|<!doctype\b|<\s*body\b/i.test(value);

const builtinTemplateLoaders = Object.freeze({
  'auth-password-reset': async () => import('./templates/auth-password-reset.js'),
  'auth-welcome': async () => import('./templates/auth-welcome.js'),
  general: async () => import('./templates/general.js'),
  'job-completed': async () => import('./templates/job-completed.js'),
  'notifications-new-comment': async () => import('./templates/notifications-new-comment.js'),
  'password-reset': async () => import('./templates/password-reset.js'),
  'performance-report': async () => import('./templates/performance-report.js'),
  welcome: async () => import('./templates/welcome.js'),
  'worker-alert': async () => import('./templates/worker-alert.js'),
});

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

function normalizeTemplateName(templateName: string): {
  normalizedTemplate: string;
  normalizedModuleName: string;
} {
  return {
    normalizedTemplate: templateName.endsWith('.html') ? templateName : `${templateName}.html`,
    normalizedModuleName: templateName.endsWith('.html') ? templateName.slice(0, -5) : templateName,
  };
}

async function tryBuiltinLoader(normalizedModuleName: string): Promise<string | null> {
  const builtinLoader =
    builtinTemplateLoaders[normalizedModuleName as keyof typeof builtinTemplateLoaders];

  if (builtinLoader === undefined) {
    return null;
  }

  try {
    const imported = (await builtinLoader()) as { default?: unknown };
    if (typeof imported.default === 'string' && imported.default.trim() !== '') {
      return imported.default;
    }
  } catch {
    // Fall through to filesystem/module path probes.
  }

  return null;
}

function getFileCandidates(templatePath: string, normalizedTemplate: string): string[] {
  const cwd = getSafeCwd();
  const baseDir = getBaseDir();

  return [
    templatePath,
    join(baseDir, 'templates', normalizedTemplate),
    join(cwd, 'dist', 'src', 'tools', 'mail', 'templates', normalizedTemplate),
    join(cwd, 'src', 'tools', 'mail', 'templates', normalizedTemplate),
  ].filter((path, index, arr) => path.trim() !== '' && arr.indexOf(path) === index);
}

function getModuleCandidates(normalizedModuleName: string): string[] {
  const cwd = getSafeCwd();
  const baseDir = getBaseDir();

  return [
    join(cwd, 'dist', 'src', 'tools', 'mail', 'templates', `${normalizedModuleName}.js`),
    join(cwd, 'src', 'tools', 'mail', 'templates', `${normalizedModuleName}.ts`),
    join(baseDir, 'templates', `${normalizedModuleName}.js`),
    join(baseDir, 'templates', `${normalizedModuleName}.ts`),
  ].filter((path, index, arr) => path.trim() !== '' && arr.indexOf(path) === index);
}

async function tryReadFromCandidates(
  candidates: string[]
): Promise<{ content?: string; error?: unknown }> {
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const content = await readFile(candidate, 'utf-8');
      return { content };
    } catch (error) {
      lastError = error;
    }
  }

  return { error: lastError };
}

async function tryImportFromCandidates(
  moduleCandidates: string[]
): Promise<{ content?: string; error?: unknown }> {
  let lastError: unknown;

  for (const modulePath of moduleCandidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const imported = (await import(pathToFileURL(modulePath).href)) as { default?: unknown };
      if (typeof imported.default === 'string' && imported.default.trim() !== '') {
        return { content: imported.default };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return { error: lastError };
}

async function loadTemplateContent(templateName: string): Promise<string> {
  const templatePath = resolveTemplatePath(templateName);
  const { normalizedTemplate, normalizedModuleName } = normalizeTemplateName(templateName);

  // Try builtin loader first
  const builtinResult = await tryBuiltinLoader(normalizedModuleName);
  if (builtinResult !== null && typeof builtinResult === 'string') {
    return builtinResult;
  }

  // Try file system candidates
  const fileCandidates = getFileCandidates(templatePath, normalizedTemplate);
  const fileResult = await tryReadFromCandidates(fileCandidates);

  if (fileResult.content !== undefined) {
    return fileResult.content;
  }

  // Try module candidates
  const moduleCandidates = getModuleCandidates(normalizedModuleName);
  const moduleResult = await tryImportFromCandidates(moduleCandidates);

  if (moduleResult.content !== undefined) {
    return moduleResult.content;
  }

  // Extract last error from failed attempts
  const lastError = fileResult.error ?? moduleResult.error;

  throw ErrorFactory.createConfigError(
    `Failed to load template from known paths: ${[...fileCandidates, ...moduleCandidates].join(', ')}` +
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
  return renderBlockTags(template, 'if', (condition: string, content: string): string => {
    const value = variables[condition];
    return value === true || value === 'true' ? content : '';
  });
}

/**
 * Render loop blocks {{#each_array}}...{{/each_array}}
 */
function renderLoops(template: string, variables: TemplateVariables): string {
  return renderBlockTags(template, 'each', (arrayName: string, content: string): string => {
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
  });
}

const isSafeBlockName = (value: string): boolean => /^\w+$/.test(value);

const renderBlockTags = (
  template: string,
  tagPrefix: 'if' | 'each',
  resolver: (name: string, content: string) => string
): string => {
  const openPrefix = `{{#${tagPrefix}_`;
  let cursor = 0;
  let output = '';

  while (cursor < template.length) {
    const openIndex = template.indexOf(openPrefix, cursor);
    if (openIndex < 0) {
      output += template.slice(cursor);
      break;
    }

    output += template.slice(cursor, openIndex);

    const nameStart = openIndex + openPrefix.length;
    const openEnd = template.indexOf('}}', nameStart);
    if (openEnd < 0) {
      output += template.slice(openIndex);
      break;
    }

    const name = template.slice(nameStart, openEnd);
    if (!isSafeBlockName(name)) {
      output += template.slice(openIndex, openEnd + 2);
      cursor = openEnd + 2;
      continue;
    }

    const closeToken = `{{/${tagPrefix}_${name}}}`;
    const contentStart = openEnd + 2;
    const closeIndex = template.indexOf(closeToken, contentStart);

    if (closeIndex < 0) {
      output += template.slice(openIndex);
      break;
    }

    const content = template.slice(contentStart, closeIndex);
    output += resolver(name, content);
    cursor = closeIndex + closeToken.length;
  }

  return output;
};

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
