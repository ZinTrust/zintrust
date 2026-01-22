import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFile } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';

import { Env } from '@config/env';
import type { TemplateVariables } from '@mail/template-utils';
import { interpolate } from '@mail/template-utils';

/**
 * Load and render email template with variable substitution
 */
export async function loadTemplate(
  templateName: string,
  variables: TemplateVariables = {}
): Promise<string> {
  try {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const isPath = templateName.includes('/') || templateName.endsWith('.html');
    let templatePath: string;
    if (isPath) {
      if (templateName.startsWith('/')) {
        templatePath = templateName;
      } else {
        templatePath = join(process.cwd(), templateName);
      }
    } else {
      templatePath = join(baseDir, 'templates', `${templateName}.html`);
    }
    let template: string;
    try {
      template = await readFile(templatePath, 'utf-8');
    } catch {
      // Fallback to built-in directory if the supplied name looked like a file but wasn't found
      const fallbackPath = join(
        baseDir,
        'templates',
        templateName.endsWith('.html') ? templateName : `${templateName}.html`
      );
      template = await readFile(fallbackPath, 'utf-8');
    }

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
