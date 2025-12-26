/**
 * Project Scaffolder - New project generation
 * Handles directory structure and boilerplate file creation
 */

import { Logger } from '@config/logger';
import fs from '@node-singletons/fs';
import { fileURLToPath } from '@node-singletons/url';
import * as path from 'node:path';

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
    const renderedPath = file.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
      String(variables[key] ?? '')
    );
    const fullPath = path.join(projectPath, renderedPath);
    const rendered = content.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
      String(variables[key] ?? '')
    );
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, rendered);
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
    // If the template already produced an .env, do not overwrite it here.
    if (fs.existsSync(fullPath)) {
      return true;
    }
    const name = String(variables['projectName'] ?? 'zintrust-app');
    const port = Number(variables['port'] ?? 3000);
    const database = String(variables['database'] ?? 'sqlite');

    const baseLines: string[] = [
      'NODE_ENV=development',
      `APP_NAME=${name}`,
      `APP_PORT=${port}`,
      'APP_DEBUG=true',
      // Placeholders only (no generated secrets during scaffold)
      'APP_KEY=',
      `DB_CONNECTION=${database}`,
    ];

    const dbLines: string[] = (() => {
      if (database === 'postgresql' || database === 'postgres') {
        return [
          'DB_HOST=localhost',
          'DB_PORT=5432',
          'DB_DATABASE=zintrust',
          'DB_USERNAME=postgres',
          'DB_PASSWORD=',
        ];
      }
      if (database === 'sqlite') {
        return ['DB_DATABASE=./database.sqlite'];
      }
      return [];
    })();

    const placeholderLines: string[] = [
      '',
      '# Logging',
      'LOG_LEVEL=debug',
      'LOG_CHANNEL=file',
      '',
      '# Auth / Security',
      'JWT_SECRET=',
      'JWT_EXPIRES_IN=1h',
      'CSRF_SECRET=',
      'ENCRYPTION_KEY=',
      '',
      '# Cache / Queue',
      'CACHE_DRIVER=memory',
      'CACHE_TTL=300',
      'QUEUE_DRIVER=sync',
      '',
      '# Microservices',
      'SERVICE_DISCOVERY_ENABLED=false',
      'SERVICE_DISCOVERY_DRIVER=local',
      'SERVICE_NAME=',
      'SERVICE_VERSION=1.0.0',
    ];

    const lines: string[] = [...baseLines, ...dbLines, ...placeholderLines];

    fs.writeFileSync(fullPath, lines.join('\n') + '\n');
    return true;
  } catch {
    Logger.error('Failed to create .env file');
    return false;
  }
};

type TemplateJson = {
  name?: unknown;
  description?: unknown;
  directories?: unknown;
};

const getProjectTemplatesRoot = (): string => {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  // src/cli/scaffolding/ -> src/templates/project/
  return path.resolve(thisDir, '..', '..', 'templates', 'project');
};

const listTemplateFilesRecursive = (dirPath: string): string[] => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTemplateFilesRecursive(full));
      continue;
    }
    if (entry.isFile()) {
      files.push(full);
    }
  }

  return files;
};

const coerceStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push(item);
  }
  return out;
};

const readTemplateJson = (templateJsonPath: string): TemplateJson => {
  try {
    return JSON.parse(fs.readFileSync(templateJsonPath, 'utf8')) as TemplateJson;
  } catch {
    return {};
  }
};

const resolveTemplateMetadata = (
  templateName: string,
  meta: TemplateJson,
  fallback?: ProjectTemplate
): Pick<ProjectTemplate, 'name' | 'description' | 'directories'> => {
  const name = typeof meta.name === 'string' ? meta.name : (fallback?.name ?? templateName);
  const description =
    typeof meta.description === 'string' ? meta.description : (fallback?.description ?? '');
  const directories = Array.isArray(meta.directories)
    ? coerceStringArray(meta.directories)
    : (fallback?.directories ?? []);

  return { name, description, directories };
};

const loadTemplateFiles = (templateDir: string): Record<string, string> => {
  const files: Record<string, string> = {};
  const allFiles = listTemplateFilesRecursive(templateDir);

  for (const absPath of allFiles) {
    const rel = path.relative(templateDir, absPath);
    if (rel === 'template.json') continue;

    const content = fs.readFileSync(absPath, 'utf8');
    const outputRel = rel.endsWith('.tpl') ? rel.slice(0, -'.tpl'.length) : rel;
    files[outputRel] = content;
  }

  return files;
};

const loadTemplateFromDisk = (
  templateName: string,
  fallback?: ProjectTemplate
): ProjectTemplate | undefined => {
  const root = getProjectTemplatesRoot();
  const templateDir = path.join(root, templateName);
  const templateJsonPath = path.join(templateDir, 'template.json');

  if (!fs.existsSync(templateDir) || !fs.existsSync(templateJsonPath)) {
    return undefined;
  }

  const meta = readTemplateJson(templateJsonPath);
  const resolved = resolveTemplateMetadata(templateName, meta, fallback);
  const files = loadTemplateFiles(templateDir);

  return { ...resolved, files };
};

/**
 * Project Scaffolder Factory
 */
const BASIC_TEMPLATE: ProjectTemplate = {
  name: 'basic',
  description: 'Basic Zintrust project structure',
  directories: [
    'app/Controllers',
    'app/Middleware',
    'app/Models',
    'config',
    'database/migrations',
    'database/seeders',
    'public',
    'routes',
    'src',
    'tests/unit',
    'tests/integration',
  ],
  files: {},
};

const API_TEMPLATE: ProjectTemplate = {
  name: 'api',
  description: 'API-focused Zintrust project structure',
  directories: ['app/Controllers', 'app/Middleware', 'app/Models', 'routes', 'tests'],
  files: {},
};

const MICROSERVICE_TEMPLATE: ProjectTemplate = {
  name: 'microservice',
  description: 'Microservice-focused Zintrust project structure',
  directories: [
    'app/Controllers',
    'app/Middleware',
    'app/Models',
    'routes',
    'tests',
    'src/services',
    'src/microservices',
  ],
  files: {},
};

const FULLSTACK_TEMPLATE: ProjectTemplate = {
  name: 'fullstack',
  description: 'Fullstack Zintrust project structure',
  directories: [
    'app/Controllers',
    'app/Middleware',
    'app/Models',
    'config',
    'database/migrations',
    'database/seeders',
    'public',
    'routes',
    'src',
    'tests/unit',
    'tests/integration',
  ],
  files: {},
};

const TEMPLATE_MAP: ReadonlyMap<string, ProjectTemplate> = new Map<string, ProjectTemplate>([
  ['basic', BASIC_TEMPLATE],
  ['api', API_TEMPLATE],
  ['microservice', MICROSERVICE_TEMPLATE],
  ['fullstack', FULLSTACK_TEMPLATE],
]);

export function getAvailableTemplates(): string[] {
  return [...TEMPLATE_MAP.keys()];
}

export function getTemplate(name: string): ProjectTemplate | undefined {
  const fallback = TEMPLATE_MAP.get(name);
  if (!fallback) return undefined;

  const disk = loadTemplateFromDisk(name, fallback);
  return disk ?? fallback;
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

  const migrationTimestamp = new Date()
    .toISOString()
    .replaceAll(/[-:T.Z]/g, '')
    .slice(0, 14);

  state.variables = {
    projectName: options.name,
    projectSlug: options.name,
    author: options.author ?? 'Your Name',
    description: options.description ?? '',
    port: options.port ?? 3000,
    database: options.database ?? 'sqlite',
    template: state.templateName,
    migrationTimestamp,
  };
};

const createDirectoriesForState = (state: ScaffolderState): number => {
  const template = resolveTemplate(state.templateName);
  return createDirectories(state.projectPath, template?.directories ?? []);
};

const createFilesForState = (state: ScaffolderState): number => {
  const template = resolveTemplate(state.templateName);
  const variables = state.variables;

  const templateFiles = template?.files;
  const files: Record<string, string> =
    templateFiles !== undefined && Object.keys(templateFiles).length > 0
      ? { ...templateFiles }
      : {};

  // Backward-compatible defaults for templates that don't ship these files yet.
  if (!Object.prototype.hasOwnProperty.call(files, '.gitignore')) {
    files['.gitignore'] = `node_modules/
dist/
.env
.env.local
.DS_Store
coverage/
logs/
*.log
`;
  }

  if (!Object.prototype.hasOwnProperty.call(files, 'README.md')) {
    files['README.md'] = `# {{projectName}}

Starter Task API built with Zintrust.

## Run

\`\`\`bash
npm install
zin s
\`\`\`

- Health: http://localhost:{{port}}/health
- Tasks:  http://localhost:{{port}}/api/tasks
`;
  }

  return createFiles(state.projectPath, files, variables);
};

const scaffoldWithState = async (
  state: ScaffolderState,
  options: ProjectScaffoldOptions
  // eslint-disable-next-line @typescript-eslint/require-await
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
