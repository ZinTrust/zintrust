/**
 * Project Scaffolder - New project generation
 * Handles directory structure and boilerplate file creation
 */

import { Logger } from '@config/logger';
import { randomBytes } from '@node-singletons/crypto';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';

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

const loadCoreVersion = (): string => {
  try {
    const packageUrl = new URL('../../../package.json', import.meta.url);
    const packageJson = JSON.parse(fs.readFileSync(packageUrl, 'utf-8')) as { version?: string };
    return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
};

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
  const renderPathVar = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return '';
  };

  const renderContentVar = (value: unknown): string => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'function') return '[Function]';

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  };

  let count = 0;
  for (const [file, content] of Object.entries(files)) {
    const renderedPath = file.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
      renderPathVar(variables[key])
    );
    const fullPath = path.join(projectPath, renderedPath);
    const rendered = content.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) =>
      renderContentVar(variables[key])
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
        port: variables['port'] ?? 7777,
      },
    };

    fs.writeFileSync(fullPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
};

const stripEnvInlineComment = (value: string): string => {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble && ch === '#') {
      const prev = value[i - 1];
      if (prev === undefined || prev === ' ' || prev === '\t') {
        return value.slice(0, i).trimEnd();
      }
    }
  }

  return value;
};

const backfillEnvDefaults = (envPath: string, defaults: Record<string, string>): void => {
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const seen = new Set<string>();
  const filled = new Set<string>();

  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return line;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) return line;

    const key = withoutExport.slice(0, eq).trim();
    if (key === '') return line;
    if (!Object.hasOwn(defaults, key)) return line;
    if (seen.has(key)) return line;
    seen.add(key);

    const rhs = withoutExport.slice(eq + 1);
    const withoutComment = stripEnvInlineComment(rhs);
    const value = withoutComment.trim();

    if (value !== '') return line;

    filled.add(key);
    return `${key}=${defaults[key]}`;
  });

  const missingKeys = Object.keys(defaults).filter((k) => !seen.has(k));
  if (missingKeys.length > 0) {
    out.push(...missingKeys.map((k) => `${k}=${defaults[k]}`));
  }

  // Avoid rewriting if nothing changed.
  if (filled.size === 0 && missingKeys.length === 0) return;

  fs.writeFileSync(envPath, out.join('\n') + (out.at(-1) === '' ? '' : '\n'));
};

const buildDatabaseEnvLines = (database: string): string[] => {
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
    // Provide both DB_DATABASE (used by the framework) and DB_PATH (common alias)
    return ['DB_DATABASE=./database.sqlite', 'DB_PATH=./database.sqlite'];
  }
  return [];
};

const createEnvFile = (projectPath: string, variables: Record<string, unknown>): boolean => {
  try {
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const fullPath = path.join(projectPath, '.env');

    // If an .env already exists (e.g., from a template), do not overwrite user values.
    // But we *do* backfill safe defaults for common bootstrap keys when missing/blank.
    if (fs.existsSync(fullPath)) {
      backfillEnvDefaults(fullPath, {
        HOST: 'localhost',
        PORT: String(Number(variables['port'] ?? 7777)),
        LOG_LEVEL: 'debug',
      });
      return true;
    }

    const name =
      typeof variables['projectName'] === 'string' ? variables['projectName'] : 'zintrust-app';
    const port = Number(variables['port'] ?? 7777);
    const database = typeof variables['database'] === 'string' ? variables['database'] : 'sqlite';

    // Generate a secure APP_KEY (32 bytes = 256-bit, base64 encoded)
    const appKeyBytes = randomBytes(32);
    const appKey = appKeyBytes.toString('base64');

    const baseLines: string[] = [
      'NODE_ENV=development',
      'STARTUP_REQUIRE_ENV=true',
      `APP_NAME=${name}`,
      'HOST=localhost',
      `PORT=${port}`,
      `APP_PORT=${port}`,
      'APP_DEBUG=true',
      // Auto-generated secure key for storage signing and encryption
      `APP_KEY=${appKey}`,
      `DB_CONNECTION=${database}`,
    ];

    const dbLines: string[] = buildDatabaseEnvLines(database);

    const placeholderLines: string[] = [
      '',
      '# Logging',
      'LOG_LEVEL=debug',
      'LOG_CHANNEL=console',
      'LOG_FORMAT=json',
      '',
      '# Auth / Security',
      'JWT_SECRET=',
      'JWT_EXPIRES_IN=1h',
      'CSRF_SECRET=',
      'ENCRYPTION_CIPHER=aes-256-cbc',
      'APP_PREVIOUS_KEYS=',
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
  // src/cli/scaffolding/ -> src/templates/project/
  const templatesUrl = new URL('../../templates/project', import.meta.url);
  return fileURLToPath(templatesUrl);
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

  const allowedConfigFiles = new Set<string>([
    'config/broadcast.ts',
    'config/cache.ts',
    'config/database.ts',
    'config/logging/HttpLogger.ts',
    'config/mail.ts',
    'config/notification.ts',
    'config/queue.ts',
    'config/storage.ts',
  ]);

  const isENOENT = (error: unknown): boolean =>
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any).code === 'ENOENT';

  const normalizeRelPath = (relPath: string): string => relPath.replaceAll('\\', '/');

  const getOutputRelPath = (relPath: string): string =>
    relPath.endsWith('.tpl') ? relPath.slice(0, -'.tpl'.length) : relPath;

  const shouldIncludeTemplateFile = (relPath: string): boolean => {
    if (relPath === 'template.json') return false;

    const normalized = normalizeRelPath(relPath);

    // Project `.env` is generated by createEnvFile() so it can set defaults and create a secure APP_KEY.
    // Some templates ship `.env.tpl` (which would become `.env`), but that file is intentionally ignored.
    const outputRel = normalizeRelPath(getOutputRelPath(relPath));
    if (outputRel === '.env') return false;

    if (!normalized.startsWith('config/')) return true;

    // Starter apps should only ship app-level config modules.
    // Core/framework config internals (e.g. config/logging/*) remain core-owned.
    return allowedConfigFiles.has(outputRel);
  };

  const readUtf8FileOrUndefined = (absPath: string): string | undefined => {
    try {
      return fs.readFileSync(absPath, 'utf8');
    } catch (error: unknown) {
      // Some tests temporarily create/delete template files in parallel; if a file
      // disappears between directory listing and read, skip it.
      if (isENOENT(error)) return undefined;
      throw error;
    }
  };

  for (const absPath of allFiles) {
    const rel = path.relative(templateDir, absPath);
    if (!shouldIncludeTemplateFile(rel)) continue;

    const content = readUtf8FileOrUndefined(absPath);
    if (content === undefined) continue;

    const outputRel = getOutputRelPath(rel);
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
    'config',
    'app/Controllers',
    'app/Middleware',
    'app/Models',
    'database/migrations',
    'database/seeders',
    'logs',
    'storage',
    'tmp',
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
  directories: [
    'app/Controllers',
    'app/Middleware',
    'app/Models',
    'logs',
    'storage',
    'tmp',
    'routes',
    'tests',
  ],
  files: {},
};

const MICROSERVICE_TEMPLATE: ProjectTemplate = {
  name: 'microservice',
  description: 'Microservice-focused Zintrust project structure',
  directories: [
    'app/Controllers',
    'app/Middleware',
    'app/Models',
    'logs',
    'storage',
    'tmp',
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
    // Starter projects should not include framework config internals.
    'database/migrations',
    'database/seeders',
    'logs',
    'storage',
    'tmp',
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
  if (disk) return disk;

  // If we don't have a dedicated disk template yet (e.g. fullstack/api/microservice),
  // fall back to the starter project's file set so generated projects are runnable.
  if (name !== 'basic') {
    const basicFallback = TEMPLATE_MAP.get('basic');
    const basicDisk = basicFallback ? loadTemplateFromDisk('basic', basicFallback) : undefined;

    if (basicDisk) {
      return {
        ...fallback,
        files: basicDisk.files,
      };
    }
  }

  return fallback;
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
    port: options.port ?? 7777,
    database: options.database ?? 'sqlite',
    template: state.templateName,
    migrationTimestamp,
    coreVersion: loadCoreVersion(),
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
  if (!Object.hasOwn(files, '.gitignore')) {
    files['.gitignore'] = `node_modules/
dist/
.env
.env.*
.env.local
.DS_Store
coverage/
logs/
storage/
tmp/
*.log
`;
  }

  if (!Object.hasOwn(files, 'README.md')) {
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
