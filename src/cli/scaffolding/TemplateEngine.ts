/**
 * Template Engine
 * Handles template rendering with variable substitution
 * Sealed namespace with immutable template rendering methods
 */

export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

export interface Template {
  name: string;
  description: string;
  files: TemplateFile[];
  directories: string[];
}

/**
 * A file that will be copied from a template source into the generated project.
 * `path`   -> destination path in the generated project
 * `source` -> template file path (relative to the template root directory)
 */
export interface TemplateFile {
  path: string;
  source: string;
  isTemplate?: boolean;
}

/**
 * Render template content with variables
 */
const renderTemplate = (content: string, variables: TemplateVariables): string => {
  let result = content;

  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined || value === null) continue;

    const regex = new RegExp(String.raw`{{\s*${key}\s*}}`, 'g');
    result = result.replace(regex, String(value));
  }

  return result;
};

/**
 * Get template variables with default values
 */
const mergeTemplateVariables = (
  custom: TemplateVariables,
  defaults: TemplateVariables
): TemplateVariables => {
  return { ...defaults, ...custom };
};

/**
 * Check if content contains template variables
 * Uses a non-backtracking pattern to prevent ReDoS vulnerability (S5852)
 * Limits variable name length to 255 characters as a practical constraint
 */
const hasTemplateVariables = (content: string): boolean => {
  return /\{\{[^}]{1,255}\}\}/.test(content);
};

/**
 * Extract variable names from content
 * Uses a non-backtracking pattern to prevent ReDoS vulnerability (S5852)
 * Limits variable name length to 255 characters as a practical constraint
 */
const extractTemplateVariables = (content: string): string[] => {
  const matches = content.match(/\{\{([^}]{1,255})\}\}/g);
  if (matches === null) return [];

  return matches
    .map((match) => match.replaceAll(/\{\{|\}\}/g, '').trim())
    .filter((v, i, arr) => arr.indexOf(v) === i); // Unique
};

/**
 * TemplateEngine namespace - sealed for immutability
 */
export const TemplateEngine = Object.freeze({
  render: renderTemplate,
  renderContent: renderTemplate,
  renderPath: renderTemplate,
  mergeVariables: mergeTemplateVariables,
  hasVariables: hasTemplateVariables,
  extractVariables: extractTemplateVariables,
});

/**
 * Built-in template definitions (file-based; no inline contents)
 *
 * `source` paths are relative to your template root directory (wherever the CLI loader reads from).
 */
export const BUILT_IN_TEMPLATES: Record<string, Template> = {
  basic: {
    name: 'basic',
    description: 'Basic Zintrust application',
    directories: [
      'src',
      'app/Models',
      'app/Controllers',
      'routes',
      'tests/unit',
      'tests/integration',
      'config',
      'database/migrations',
      'database/seeders',
    ],
    files: [
      { path: 'package.json', source: 'basic/package.json', isTemplate: true },
      { path: '.env.example', source: 'basic/.env.example', isTemplate: true },
      { path: 'tsconfig.json', source: 'basic/tsconfig.json' },
      { path: '.gitignore', source: 'basic/.gitignore' },
      { path: 'README.md', source: 'basic/README.md', isTemplate: true },
      { path: 'src/index.ts', source: 'basic/src/index.ts' },
      { path: 'routes/api.ts', source: 'basic/routes/api.ts', isTemplate: true },
    ],
  },

  api: {
    name: 'api',
    description: 'RESTful API with microservices support',
    directories: [
      'src',
      'app/Models',
      'app/Controllers',
      'app/Services',
      'routes',
      'tests/unit',
      'tests/integration',
      'config',
      'database/migrations',
      'database/seeders',
      'services',
    ],
    files: [
      { path: 'package.json', source: 'api/package.json', isTemplate: true },
      { path: '.env.example', source: 'api/.env.example', isTemplate: true },
      { path: 'README.md', source: 'api/README.md', isTemplate: true },
    ],
  },
};
