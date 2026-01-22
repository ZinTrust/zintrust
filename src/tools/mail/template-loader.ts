import { ErrorFactory } from '@exceptions/ZintrustError';
import { readFile } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Load and render email template with variable substitution
 */
export async function loadTemplate(
  templateName: string,
  variables: TemplateVariables = {}
): Promise<string> {
  try {
    const templatePath = join(__dirname, 'templates', templateName);
    const template = await readFile(templatePath, 'utf-8');

    // Replace template variables {{variable}} with actual values
    let rendered = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replaceAll(regex, String(value ?? ''));
    }

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
      const value = variables[condition as keyof TemplateVariables];

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
      const array = variables[arrayName as keyof TemplateVariables] as unknown[] | undefined;

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
  ];
}
