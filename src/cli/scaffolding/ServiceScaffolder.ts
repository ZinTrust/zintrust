/**
 * ServiceScaffolder - Generate microservices within a project
 * Creates service structure with controllers, models, routes, and config
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import * as path from '@node-singletons/path';

export interface ServiceOptions {
  name: string; // e.g., 'users', 'orders', 'payments'
  domain?: string; // e.g., 'ecommerce' (optional)
  port?: number; // Service port
  database?: 'shared' | 'isolated'; // Database isolation mode
  auth?: 'api-key' | 'jwt' | 'none' | 'custom'; // Authentication strategy
  withMigration?: boolean; // Create migration?
  withFactory?: boolean; // Create factory?
  withSeeder?: boolean; // Create seeder?
}

export interface ServiceScaffoldResult {
  success: boolean;
  serviceName: string;
  servicePath: string;
  filesCreated: string[];
  message: string;
}

const coreModuleSpecifier = ['@zintrust', 'core'].join('/');
const coreStartModuleSpecifier = `${coreModuleSpecifier}/start`;
const serviceManifestImportExpression =
  "import('./bootstrap/service-manifest.ts').catch(() => import('./bootstrap/service-manifest.js'))";

const buildRouteImportExpression = (domain: string, serviceName: string): string =>
  `import('../services/${domain}/${serviceName}/routes/api.ts').catch(() => import('../services/${domain}/${serviceName}/routes/api.js'))`;

/**
 * ServiceScaffolder generates microservices with all necessary files
 */

/**
 * Validate service options
 */
export function validateOptions(options: ServiceOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options.name === undefined || options.name.trim().length === 0) {
    errors.push('Service name is required');
  }

  if (options.name !== undefined && !/^[a-z]+$/.test(options.name)) {
    errors.push('Service name must contain only lowercase letters');
  }

  if (options.port !== undefined && (options.port < 1024 || options.port > 65535)) {
    errors.push('Port must be between 1024 and 65535');
  }

  if (options.domain !== undefined && !/^[a-z]+$/.test(options.domain)) {
    errors.push('Domain must contain only lowercase letters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get service path
 */
export function getServicePath(projectRoot: string, options: ServiceOptions): string {
  const domain = options.domain ?? 'default';
  return path.join(projectRoot, 'src', 'services', domain, options.name);
}

/**
 * Generate service structure
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function scaffold(
  projectRoot: string,
  options: ServiceOptions
): Promise<ServiceScaffoldResult> {
  try {
    // Validate options
    const validation = validateOptions(options);
    if (!validation.valid) {
      return Promise.resolve({
        success: false,
        serviceName: options.name,
        servicePath: '',
        filesCreated: [],
        message: `Validation failed: ${validation.errors.join(', ')}`,
      });
    }

    const servicePath = getServicePath(projectRoot, options);

    // Check if service already exists
    if (FileGenerator.directoryExists(servicePath)) {
      return Promise.resolve({
        success: false,
        serviceName: options.name,
        servicePath,
        filesCreated: [],
        message: `Service '${options.name}' already exists at ${servicePath}`,
      });
    }

    createServiceDirectories(servicePath);
    ensureProjectRuntimeFiles(projectRoot, options);
    const filesCreated = createServiceFiles(servicePath, options);
    updateServiceManifest(projectRoot, options);

    return Promise.resolve({
      success: true,
      serviceName: options.name,
      servicePath,
      filesCreated,
      message: `Service '${options.name}' scaffolded successfully`,
    });
  } catch (error) {
    Logger.error('Service scaffolding failed', error);
    return Promise.resolve({
      success: false,
      serviceName: options.name,
      servicePath: '',
      filesCreated: [],
      message: (error as Error).message,
    });
  }
}

function ensureProjectRuntimeFiles(projectRoot: string, options: ServiceOptions): void {
  const domain = options.domain ?? 'default';
  const serviceId = `${domain}/${options.name}`;
  const routeImportExpression = buildRouteImportExpression(domain, options.name);
  const bootstrapDir = path.join(projectRoot, 'src', 'bootstrap');
  FileGenerator.createDirectory(bootstrapDir);

  const manifestPath = path.join(bootstrapDir, 'service-manifest.ts');
  if (!FileGenerator.fileExists(manifestPath)) {
    const initialManifest = `import type { ServiceManifestEntry } from '${coreModuleSpecifier}';

export const serviceManifest: ReadonlyArray<ServiceManifestEntry> = [
  {
    id: '${serviceId}',
    domain: '${domain}',
    name: '${options.name}',
    prefix: '${serviceId}',
    port: ${options.port ?? 3001},
    monolithEnabled: true,
    loadRoutes: async () => ${routeImportExpression},
  },
];

export default serviceManifest;
`;
    FileGenerator.writeFile(manifestPath, initialManifest);
  }

  const runtimeModule = `const serviceManifestModule = await ${serviceManifestImportExpression};

const serviceManifest = serviceManifestModule.default ?? serviceManifestModule.serviceManifest ?? [];

export { serviceManifest };

export default Object.freeze({ serviceManifest });
`;

  FileGenerator.writeFile(path.join(projectRoot, 'src', 'zintrust.runtime.ts'), runtimeModule, {
    overwrite: false,
  });
  FileGenerator.writeFile(path.join(projectRoot, 'src', 'zintrust.runtime.wg.ts'), runtimeModule, {
    overwrite: false,
  });
}

function updateServiceManifest(projectRoot: string, options: ServiceOptions): void {
  const domain = options.domain ?? 'default';
  const serviceId = `${domain}/${options.name}`;
  const routeImportExpression = buildRouteImportExpression(domain, options.name);
  const manifestPath = path.join(projectRoot, 'src', 'bootstrap', 'service-manifest.ts');
  if (!FileGenerator.fileExists(manifestPath)) return;

  const current = FileGenerator.readFile(manifestPath);
  if (current.includes(`id: '${serviceId}'`)) {
    return;
  }

  const entry = `  {
    id: '${serviceId}',
    domain: '${domain}',
    name: '${options.name}',
    prefix: '${serviceId}',
    port: ${options.port ?? 3001},
    monolithEnabled: true,
    loadRoutes: async () => ${routeImportExpression},
  },
`;

  const marker = '];';
  const markerIndex = current.lastIndexOf(marker);
  if (markerIndex === -1) {
    Logger.warn(`Service manifest format is unsupported; skipped update for ${serviceId}`);
    return;
  }

  const next = `${current.slice(0, markerIndex)}${entry}${current.slice(markerIndex)}`;
  FileGenerator.writeFile(manifestPath, next, { overwrite: true });
}

/**
 * Create service directory structure
 */
function createServiceDirectories(servicePath: string): void {
  const dirs = [
    'config',
    'src/controllers',
    'src/models',
    'src/services',
    'src/middleware',
    'src/migrations',
    'src/factories',
    'routes',
  ];

  for (const dir of dirs) {
    FileGenerator.createDirectory(path.join(servicePath, dir));
  }

  Logger.info('✅ Created service directories');
}

/**
 * Create initial service files
 */
function createServiceFiles(servicePath: string, options: ServiceOptions): string[] {
  const files: Array<{ path: string; content: string }> = [
    { path: 'service.config.json', content: generateServiceConfig(options) },
    { path: 'src/index.ts', content: generateServiceIndex(options) },
    { path: 'routes/api.ts', content: generateServiceRoutes(options) },
    { path: 'wrangler.jsonc', content: generateServiceWranglerConfig(options) },
    { path: 'src/controllers/ExampleController.ts', content: generateExampleController(options) },
    { path: 'src/models/Example.ts', content: generateExampleModel(options) },
    { path: '.env', content: generateServiceEnv(options) },
    { path: 'src/middleware/index.ts', content: '// Service middleware exports\nexport {};\n' },
    { path: 'README.md', content: generateServiceReadme(options) },
  ];

  const created: string[] = [];
  for (const file of files) {
    const fullPath = path.join(servicePath, file.path);
    FileGenerator.writeFile(fullPath, file.content);
    created.push(fullPath);
  }

  return created;
}

/**
 * Generate service.config.json content
 */
function generateServiceConfig(options: ServiceOptions): string {
  const port = options.port ?? 3001;
  const config = {
    name: options.name,
    domain: options.domain ?? 'default',
    port,
    version: '1.0.0',
    description: `${options.name} microservice`,
    database: {
      isolation: options.database ?? 'shared',
      migrations: options.withMigration !== false,
    },
    auth: {
      strategy: options.auth ?? 'api-key',
    },
    tracing: {
      enabled: true,
      samplingRate: 1,
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate service index.ts
 */
function generateServiceIndex(options: ServiceOptions): string {
  const domain = options.domain ?? 'default';
  const serviceId = `${domain}/${options.name}`;
  const configRoot = `src/services/${domain}/${options.name}/config`;

  return `/**
 * ${options.name} Service - Entry Point
 * Port: ${options.port ?? 3001}
 * Database: ${options.database ?? 'shared'}
 * Auth: ${options.auth ?? 'api-key'}
 */

import { bootStandaloneService } from '${coreStartModuleSpecifier}';

await bootStandaloneService(import.meta.url, {
  id: '${serviceId}',
  domain: '${domain}',
  name: '${options.name}',
  configRoot: '${configRoot}',
});

// Cloudflare Workers entry.
export { default } from '${coreStartModuleSpecifier}';
`;
}

/**
 * Generate service routes
 */
function generateServiceRoutes(options: ServiceOptions): string {
  return `/**
 * ${options.name} Service Routes
 */

import { Router, type IRequest, type IResponse, type IRouter } from '${coreModuleSpecifier}';

export function registerRoutes(router: IRouter): void {
  // Example route
  Router.get(
    router,
    '/',
    (_req: IRequest, res: IResponse): void => {
      res.json({ message: '${options.name} service' });
    },
    {
      meta: {
        summary: 'Service root',
        tags: ['Service'],
        responseStatus: 200,
      },
    }
  );
}
`;
}

function generateServiceWranglerConfig(options: ServiceOptions): string {
  const domain = options.domain ?? 'default';
  const serviceSlug = `${domain}-${options.name}`;
  const rootPath = '../../../../';

  return `{
  "name": "${serviceSlug}",
  "main": "./src/index.ts",
  "compatibility_date": "2025-04-21",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "minify": false,
  "alias": {
    "@routes/api.ts": "./routes/api.ts",
    "@service-runtime-config/broadcast.ts": "./config/broadcast.ts",
    "@service-runtime-config/cache.ts": "./config/cache.ts",
    "@service-runtime-config/database.ts": "./config/database.ts",
    "@service-runtime-config/mail.ts": "./config/mail.ts",
    "@service-runtime-config/storage.ts": "./config/storage.ts",
    "@service-runtime-config/queue.ts": "./config/queue.ts",
    "@service-runtime-config/notification.ts": "./config/notification.ts",
    "@service-runtime-config/middleware.ts": "./config/middleware.ts",
    "../zintrust.runtime.wg.js": "${rootPath}src/zintrust.runtime.wg.ts",
    "../zintrust.plugins.wg.js": "${rootPath}src/zintrust.plugins.wg.ts",
    "@runtime-config/broadcast.ts": "${rootPath}config/broadcast.ts",
    "@runtime-config/cache.ts": "${rootPath}config/cache.ts",
    "@runtime-config/database.ts": "${rootPath}config/database.ts",
    "@runtime-config/mail.ts": "${rootPath}config/mail.ts",
    "@runtime-config/storage.ts": "${rootPath}config/storage.ts",
    "@runtime-config/queue.ts": "${rootPath}config/queue.ts",
    "@runtime-config/notification.ts": "${rootPath}config/notification.ts",
    "@runtime-config/middleware.ts": "${rootPath}config/middleware.ts"
  },
  "vars": {
    "ENVIRONMENT": "development",
    "SERVICE_NAME": "${options.name}",
    "SERVICE_DOMAIN": "${domain}",
    "SERVICE_PORT": "${options.port ?? 3001}"
  }
}
`;
}

/**
 * Generate example controller
 */
function generateExampleController(options: ServiceOptions): string {
  const className = `${options.name.charAt(0).toUpperCase()}${options.name.slice(1)}Controller`;
  return `/**
 * Example Controller for ${options.name} Service
 */

import { type IRequest, type IResponse, Controller } from '${coreModuleSpecifier}';
const controller = Object.freeze({
  ...Controller,

  /**
   * List all items
   */
  async index(_req: IRequest, res: IResponse): Promise<void> {
    res.json({ data: [] });
  },

  /**
   * Create new item
   */
  async store(_req: IRequest, res: IResponse): Promise<void> {
    res.setStatus(201).json({ created: true });
  },

  /**
   * Get item by ID
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    const { id } = req.getParams();
    res.json({ id });
  },

  /**
   * Update item
   */
  async update(req: IRequest, res: IResponse): Promise<void> {
    const { id } = req.getParams();
    res.json({ updated: true, id });
  },

  /**
   * Delete item
   */
  async destroy(req: IRequest, res: IResponse): Promise<void> {
    const { id } = req.getParams();
    res.json({ deleted: true, id });
  },
};

export type ${className}Api = typeof controller;

export const ${className} = Object.freeze({
  create(): ${className}Api {
    return controller;
  },
});

export default ${className};
`;
}

/**
 * Generate example model
 */
function generateExampleModel(options: ServiceOptions): string {
  return `/**
 * Example Model for ${options.name} Service
 */

import { Model } from '${coreModuleSpecifier}';

export const Example = Model.define({
  table: '${options.name}',
  fillable: ['name', 'description'],
  timestamps: true,
  casts: {},
}, {
  // Define relationships here
  // async user(model: IModel) { return model.belongsTo(User); }
});
`;
}

/**
 * Generate service .env file
 */
function generateServiceEnv(options: ServiceOptions): string {
  return `# ${options.name} Service Configuration

# Service Port
${options.name?.toUpperCase()}_PORT=${options.port ?? 3001}

# Database
DATABASE_CONNECTION=${options.database === 'isolated' ? 'postgresql' : 'shared'}
${options.database === 'isolated' ? `${options.name?.toUpperCase()}_DB_HOST=localhost\n${options.name?.toUpperCase()}_DB_DATABASE=${options.name}\n${options.name?.toUpperCase()}_DB_USER=postgres\n${options.name?.toUpperCase()}_DB_PASSWORD=postgres` : ''}

# Authentication
SERVICE_AUTH_STRATEGY=${options.auth ?? 'api-key'}
SERVICE_AUTH_KEY=your-auth-key-here
CSRF_SKIP_PATHS=/api/*,/queue-monitor/*

# Tracing
SERVICE_TRACING_ENABLED=true
SERVICE_TRACING_SAMPLING_RATE=1.0

# Logging
LOG_LEVEL=info
`;
}

/**
 * Get service configuration details
 */
function getServiceConfig(options: ServiceOptions): {
  domain: string;
  port: number;
  database: string;
  auth: string;
  dbDescription: string;
} {
  return {
    domain: options.domain ?? 'default',
    port: options.port ?? 3001,
    database: options.database ?? 'shared',
    auth: options.auth ?? 'api-key',
    dbDescription:
      options.database === 'isolated'
        ? 'This service uses an isolated database instance.'
        : 'This service uses a shared database with schema isolation.',
  };
}

/**
 * Generate service README
 */
function generateServiceReadme(options: ServiceOptions): string {
  const config = getServiceConfig(options);
  const serviceDir = `src/services/${config.domain}/${options.name}`;
  const serviceId = `${config.domain}/${options.name}`;

  return `# ${options.name} Service

Microservice for ${config.domain} domain.

## Configuration

- **Port**: ${config.port}
- **Database**: ${config.database}
- **Auth**: ${config.auth}

## Getting Started

\`\`\`bash
# Start this service from its service directory (Node)
cd ${serviceDir}
zin s

# Start this service with Cloudflare Workers dev
cd ${serviceDir}
zin s --wg

# List this service routes from the project root
MICROSERVICES=true SERVICES=${serviceId} zin routes

# Run tests
npm test
\`\`\`

## Environment Variables

See \`.env\` file for configuration options.

## API Endpoints

- \`GET /health\` - Health check
- \`GET /\` - Service info

## Database

${config.dbDescription}

## Authentication

Uses \`${config.auth}\` authentication strategy.
`;
}

export const ServiceScaffolder = Object.freeze({
  validateOptions,
  getServicePath,
  scaffold,
});
