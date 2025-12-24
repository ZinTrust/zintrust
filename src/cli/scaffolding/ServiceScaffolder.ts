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
export async function scaffold(
  projectRoot: string,
  options: ServiceOptions
): Promise<ServiceScaffoldResult> {
  try {
    // Validate options
    const validation = validateOptions(options);
    if (!validation.valid) {
      return {
        success: false,
        serviceName: options.name,
        servicePath: '',
        filesCreated: [],
        message: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    const servicePath = getServicePath(projectRoot, options);

    // Check if service already exists
    if (FileGenerator.directoryExists(servicePath)) {
      return {
        success: false,
        serviceName: options.name,
        servicePath,
        filesCreated: [],
        message: `Service '${options.name}' already exists at ${servicePath}`,
      };
    }

    createServiceDirectories(servicePath);
    const filesCreated = createServiceFiles(servicePath, options);

    return {
      success: true,
      serviceName: options.name,
      servicePath,
      filesCreated,
      message: `Service '${options.name}' scaffolded successfully`,
    };
  } catch (error) {
    Logger.error('Service scaffolding failed', error);
    return {
      success: false,
      serviceName: options.name,
      servicePath: '',
      filesCreated: [],
      message: (error as Error).message,
    };
  }
}

/**
 * Create service directory structure
 */
function createServiceDirectories(servicePath: string): void {
  const dirs = [
    'src/controllers',
    'src/models',
    'src/services',
    'src/middleware',
    'src/migrations',
    'src/factories',
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
    { path: 'src/routes.ts', content: generateServiceRoutes(options) },
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
  return `/**
 * ${options.name} Service - Entry Point
 * Port: ${options.port ?? 3001}
 * Database: ${options.database ?? 'shared'}
 * Auth: ${options.auth ?? 'api-key'}
 */

import { Application } from '@boot/Application';
import { Server } from '@boot/Server';
import { Logger } from '@config/logger';
import { Env } from '@config/env';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = new Application(path.join(__dirname, '..'));
const port = Env.getInt('${options.name?.toUpperCase()}_PORT', ${options.port ?? 3001});

// Start server
const server = new Server(app, port);
server.start().then(() => {
  Logger.info(\`${options.name} service running on port \${port}\`);
});

export default app;
`;
}

/**
 * Generate service routes
 */
function generateServiceRoutes(options: ServiceOptions): string {
  return `/**
 * ${options.name} Service Routes
 */

import { Router } from '@routing/Router';

export function registerRoutes(router: Router): void {
  // Example route
  router.get('/', (req, res) => {
    res.json({ message: '${options.name} service' });
  });
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

import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { Controller } from '@http/Controller';

export const ${className} = {
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
`;
}

/**
 * Generate example model
 */
function generateExampleModel(options: ServiceOptions): string {
  return `/**
 * Example Model for ${options.name} Service
 */

import { Model } from '@orm/Model';

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
SERVICE_AUTH_STRATEGY=${options.auth || 'api-key'}
SERVICE_AUTH_KEY=your-auth-key-here

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

  return `# ${options.name} Service

Microservice for ${config.domain} domain.

## Configuration

- **Port**: ${config.port}
- **Database**: ${config.database}
- **Auth**: ${config.auth}

## Getting Started

\`\`\`bash
# Start service
npm start

# Run tests
npm test

# Run migrations
npm run migrate
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
