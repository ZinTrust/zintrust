/**
 * Project Scaffolder - New project generation
 * Handles directory structure and boilerplate file creation
 */

import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';

export interface ProjectScaffoldOptions {
  name: string;
  force?: boolean;
  overwrite?: boolean;
  template?: string;
  port?: number;
  author?: string;
  description?: string;
  git?: boolean;
  install?: boolean;
  database?: string;
  driver?: string;
}

export type ProjectOptions = ProjectScaffoldOptions;

export interface ProjectTemplate {
  name: string;
  description: string;
  directories: string[];
  files: Record<string, string>;
}

export interface ProjectScaffoldResult {
  success: boolean;
  projectPath: string;
  filesCreated: number;
  directoriesCreated: number;
  message: string;
  error?: Error;
}

export interface IProjectScaffolder {
  prepareContext(options: ProjectScaffoldOptions): void;
  getVariables(): Record<string, unknown>;
  getTemplateInfo(templateName?: string): ProjectTemplate | undefined;
  getProjectPath(): string;
  projectDirectoryExists(): boolean;
  createDirectories(): number;
  createFiles(options?: ProjectScaffoldOptions): number;
  createConfigFile(): boolean;
  createEnvFile(): boolean;
  scaffold(options: ProjectScaffoldOptions): Promise<ProjectScaffoldResult>;
}

interface ScaffolderState {
  variables: Record<string, unknown>;
  basePath: string;
  projectPath: string;
  templateName: string;
}

const createDirectories = (projectPath: string, directories: string[]): number => {
  let count = 0;
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
    count++;
  }
  for (const dir of directories) {
    const fullPath = path.join(projectPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      count++;
    }
  }
  return count;
};

const createFiles = (
  projectPath: string,
  files: Record<string, string>,
  variables: Record<string, unknown>
): number => {
  let count = 0;
  for (const [file, content] of Object.entries(files)) {
    const fullPath = path.join(projectPath, file);
    const rendered = content.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
      String(variables[key] ?? '')
    );
    fs.writeFileSync(fullPath, content);
    if (rendered !== content) {
      fs.writeFileSync(fullPath, rendered);
    }
    count++;
  }
  return count;
};

const createProjectConfigFile = (
  projectPath: string,
  variables: Record<string, unknown>
): boolean => {
  try {
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const fullPath = path.join(projectPath, '.zintrust.json');
    const config = {
      name: variables['projectName'] ?? variables['name'],
      database: {
        connection: variables['database'] ?? 'sqlite',
      },
      server: {
        port: variables['port'] ?? 3000,
      },
    };

    fs.writeFileSync(fullPath, JSON.stringify(config, null, 2));
    return true;
    // eslint-disable-next-line no-restricted-syntax
  } catch {
    return false;
  }
};

const createEnvFile = (projectPath: string, variables: Record<string, unknown>): boolean => {
  try {
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const fullPath = path.join(projectPath, '.env');
    const name = String(variables['projectName'] ?? 'zintrust-app');
    const port = Number(variables['port'] ?? 3000);
    const database = String(variables['database'] ?? 'sqlite');

    const lines: string[] = [`APP_NAME=${name}`, `APP_PORT=${port}`, `DB_CONNECTION=${database}`];

    if (database === 'postgresql' || database === 'postgres') {
      lines.push(
        'DB_HOST=localhost',
        'DB_PORT=5432',
        'DB_DATABASE=zintrust',
        'DB_USERNAME=postgres',
        'DB_PASSWORD='
      );
    } else if (database === 'sqlite') {
      lines.push('DB_DATABASE=./database.sqlite');
    }

    fs.writeFileSync(fullPath, lines.join('\n') + '\n');
    return true;
  } catch {
    Logger.error('Failed to create .env file');
    return false;
  }
};

/**
 * Project Scaffolder Factory
 */
export function getAvailableTemplates(): string[] {
  return ['basic', 'api', 'microservice', 'fullstack'];
}

export function getTemplate(name: string): ProjectTemplate | undefined {
  const templates: Record<string, ProjectTemplate> = {
    basic: {
      name: 'basic',
      description: 'Basic Zintrust project structure',
      directories: [
        'app/Controllers',
        'app/Middleware',
        'app/Models',
        'bin',
        'config',
        'database/migrations',
        'database/seeders',
        'public',
        'routes',
        'src',
        'tests/unit',
        'tests/integration',
      ],
      files: {
        'package.json': JSON.stringify({ name: 'zintrust-app', version: '1.0.0' }, null, 2),
        'tsconfig.json': JSON.stringify(
          { extends: './node_modules/@zintrust/framework/tsconfig.json' },
          null,
          2
        ),
      },
    },
    api: {
      name: 'api',
      description: 'API-focused Zintrust project structure',
      directories: ['app/Controllers', 'app/Middleware', 'app/Models', 'routes', 'tests'],
      files: {},
    },
  };

  return templates[name];
}

export function validateOptions(options: ProjectScaffoldOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!options.name) {
    errors.push('Project name is required');
  }

  if (options.name && !/^[a-z0-9_-]+$/.test(options.name)) {
    errors.push(
      'Project name must contain only lowercase letters, numbers, hyphens, and underscores'
    );
  }

  if (options.template !== undefined && !getTemplate(options.template)) {
    errors.push(`Template "${options.template}" not found`);
  }

  if (options.port !== undefined && (options.port < 1 || options.port > 65535)) {
    errors.push('Port must be a number between 1 and 65535');
  }

  return { valid: errors.length === 0, errors };
}

const resolveTemplate = (templateName: string): ProjectTemplate | undefined =>
  getTemplate(templateName) ?? getTemplate('basic');

const prepareContext = (state: ScaffolderState, options: ProjectScaffoldOptions): void => {
  state.templateName = options.template ?? 'basic';
  state.projectPath = path.join(state.basePath, options.name);

  state.variables = {
    projectName: options.name,
    projectSlug: options.name,
    author: options.author ?? 'Your Name',
    description: options.description ?? '',
    port: options.port ?? 3000,
    database: options.database ?? 'sqlite',
    template: state.templateName,
  };
};

const createDirectoriesForState = (state: ScaffolderState): number => {
  const template = resolveTemplate(state.templateName);
  return createDirectories(state.projectPath, template?.directories ?? []);
};

const createFilesForState = (state: ScaffolderState): number => {
  const template = resolveTemplate(state.templateName);
  const variables = state.variables;

  const files: Record<string, string> = {
    ...template?.files,
    '.gitignore': 'node_modules\ndist\n.env\n',
    'package.json': JSON.stringify({ name: variables['projectName'] ?? 'zintrust-app' }, null, 2),
    'README.md': `# {{projectName}}\n`,
  };

  return createFiles(state.projectPath, files, variables);
};

const scaffoldWithState = async (
  state: ScaffolderState,
  options: ProjectScaffoldOptions
): Promise<ProjectScaffoldResult> => {
  try {
    const validation = validateOptions(options);
    if (!validation.valid) {
      return {
        success: false,
        projectPath: path.join(state.basePath, options.name),
        filesCreated: 0,
        directoriesCreated: 0,
        message: validation.errors.join('\n'),
      };
    }

    prepareContext(state, options);

    if (fs.existsSync(state.projectPath)) {
      if (options.overwrite === true) {
        fs.rmSync(state.projectPath, { recursive: true, force: true });
      } else {
        return {
          success: false,
          projectPath: state.projectPath,
          filesCreated: 0,
          directoriesCreated: 0,
          message: `Project directory "${state.projectPath}" already exists`,
        };
      }
    }

    const directoriesCreated = createDirectoriesForState(state);
    const filesCreated = createFilesForState(state);

    createProjectConfigFile(state.projectPath, state.variables);
    createEnvFile(state.projectPath, state.variables);

    return {
      success: true,
      projectPath: state.projectPath,
      filesCreated,
      directoriesCreated,
      message: `Project "${options.name}" scaffolded successfully.`,
    };
  } catch (error: unknown) {
    Logger.error('Project scaffolding failed', error);
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      projectPath: state.projectPath,
      filesCreated: 0,
      directoriesCreated: 0,
      message: err.message,
      error: err,
    };
  }
};

/**
 * Plain-function scaffolder creator (replaces the function-object factory).
 */
export function createProjectScaffolder(projectPath: string = process.cwd()): IProjectScaffolder {
  const state: ScaffolderState = {
    variables: {},
    basePath: projectPath,
    projectPath,
    templateName: 'basic',
  };

  return {
    prepareContext: (options: ProjectScaffoldOptions): void => prepareContext(state, options),
    getVariables: (): Record<string, unknown> => state.variables,
    getTemplateInfo: (templateName?: string): ProjectTemplate | undefined =>
      getTemplate(templateName ?? state.templateName),
    getProjectPath: (): string => state.projectPath,
    projectDirectoryExists: (): boolean => fs.existsSync(state.projectPath),
    createDirectories: (): number => createDirectoriesForState(state),
    createFiles: (_options?: ProjectScaffoldOptions): number => createFilesForState(state),
    createConfigFile: (): boolean => createProjectConfigFile(state.projectPath, state.variables),
    createEnvFile: (): boolean => createEnvFile(state.projectPath, state.variables),
    scaffold: async (options: ProjectScaffoldOptions): Promise<ProjectScaffoldResult> =>
      scaffoldWithState(state, options),
  };
}

export async function scaffoldProject(
  projectPath: string,
  options: ProjectScaffoldOptions
): Promise<ProjectScaffoldResult> {
  return createProjectScaffolder(projectPath).scaffold(options);
}

/**
 * Sealed namespace for ProjectScaffolder
 */
export const ProjectScaffolder = Object.freeze({
  create: createProjectScaffolder,
  getAvailableTemplates,
  getTemplate,
  validateOptions,
  scaffold: scaffoldProject,
});
