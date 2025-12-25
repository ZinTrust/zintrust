/**
 * Project Scaffolder - New project generation
 * Handles directory structure and boilerplate file creation
 */

import { Logger } from '@config/logger';
import * as crypto from '@node-singletons/crypto';
import fs from '@node-singletons/fs';
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
    const name = String(variables['projectName'] ?? 'zintrust-app');
    const port = Number(variables['port'] ?? 3000);
    const database = String(variables['database'] ?? 'sqlite');

    const appKey = (() => {
      const raw = crypto.randomBytes(32).toString('base64');
      return `base64:${raw}`;
    })();

    const baseLines: string[] = [
      'NODE_ENV=development',
      `APP_NAME=${name}`,
      `APP_PORT=${port}`,
      'APP_DEBUG=true',
      `APP_KEY=${appKey}`,
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
  files: {
    'package.json': `{
  "name": "{{projectName}}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "zin s",
    "build": "tsc && tsc-alias",
    "start": "zin s --mode production --no-watch",
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "zintrust": "^0.1.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "tsc-alias": "^1.8.16",
    "typescript": "^5.9.3",
    "vitest": "^4.0.16"
  }
}
`,
    'tsconfig.json': `{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@app/*": ["./app/*"],
      "@routes/*": ["./routes/*"]
    }
  },
  "include": ["src/**/*", "app/**/*", "routes/**/*", "database/**/*"],
  "exclude": ["node_modules", "dist"]
}
`,
    '.env.example': `NODE_ENV=development
APP_NAME={{projectName}}
APP_PORT={{port}}
APP_DEBUG=true
APP_KEY=

DB_CONNECTION=sqlite
DB_DATABASE=./database.sqlite

LOG_LEVEL=debug
LOG_CHANNEL=file

JWT_SECRET=
JWT_EXPIRES_IN=1h

CACHE_DRIVER=memory
CACHE_TTL=300
QUEUE_DRIVER=sync

MAIL_DRIVER=smtp
MAIL_HOST=
MAIL_PORT=587
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=
`,
    'src/index.ts': `import { Application, Server } from 'zintrust';

const app = Application.create();
await app.boot();

const server = Server.create(app);
await server.listen();
`,
    'routes/api.ts': `import { Controller, Router } from 'zintrust';

import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type { IRouter } from '@routing/Router';

import { TaskController } from '@app/Controllers/TaskController';

export function registerRoutes(router: IRouter): void {
  Router.get(router, '/health', async (_req: IRequest, res: IResponse): Promise<void> => {
    Controller.json(res, {
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  Router.get(router, '/api/tasks', TaskController.index);
  Router.post(router, '/api/tasks', TaskController.store);
}
`,
    'app/Controllers/TaskController.ts': `import { Controller } from 'zintrust';

import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';

import { Task } from '@app/Models/Task';

type TaskControllerHandlers = {
  index: (_req: IRequest, res: IResponse) => Promise<void>;
  store: (req: IRequest, res: IResponse) => Promise<void>;
};

export const TaskController: TaskControllerHandlers = {
  async index(_req: IRequest, res: IResponse): Promise<void> {
    const t1 = Task.create({ title: 'First task', completed: false }).setAttribute('id', 1);
    const t2 = Task.create({ title: 'Second task', completed: true }).setAttribute('id', 2);

    Controller.json(res, {
      data: [t1.toJSON(), t2.toJSON()],
    });
  },

  async store(req: IRequest, res: IResponse): Promise<void> {
    const body = req.getBody() as Record<string, unknown>;
    const task = Task.create(body).setAttribute('id', 3);

    Controller.json(
      res,
      {
        data: task.toJSON(),
      },
      201
    );
  },
};
`,
    'app/Models/Task.ts': `import { Model } from 'zintrust';

const TaskConfig = {
  table: 'tasks',
  // Safe default: explicit allow-list for mass-assignment (create/fill)
  fillable: ['title', 'completed'],
  hidden: [],
  // Safe default for fresh scaffolds: off unless your migration creates timestamps
  timestamps: false,
  casts: {
    id: 'integer',
    completed: 'boolean',
  },
};

export const Task = Model.define(TaskConfig, (task) => ({
  getTitle: (): string => String(task.getAttribute('title') ?? ''),
  setTitle: (title: string) => task.setAttribute('title', title),
  isCompleted: (): boolean => task.getAttribute('completed') === true,
  markCompleted: () => task.setAttribute('completed', true),
}));
`,
    'database/migrations/{{migrationTimestamp}}_create_tasks_table.ts': `/**
 * Migration: CreateTasksTable
 * Creates tasks table
 */

export interface Migration {
  up(): Promise<void>;
  down(): Promise<void>;
}

export const migration: Migration = {
  async up(): Promise<void> {
    // Create table
    // await db.schema.createTable('tasks', (table) => {
    //   table.increments('id').primary();
    //   table.string('title').notNullable();
    //   table.boolean('completed').defaultTo(false);
    //   table.timestamps();
    // });
  },

  async down(): Promise<void> {
    // Drop table
    // await db.schema.dropTable('tasks');
  },
};
`,
  },
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
  return TEMPLATE_MAP.get(name);
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

  const files: Record<string, string> = {
    ...template?.files,
    '.gitignore': `node_modules/
dist/
.env
.env.local
.DS_Store
coverage/
logs/
*.log
`,
    'README.md': `# {{projectName}}

Starter Task API built with Zintrust.

## Run

\`\`\`bash
npm install
zin s
\`\`\`

- Health: http://localhost:{{port}}/health
- Tasks:  http://localhost:{{port}}/api/tasks
`,
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
