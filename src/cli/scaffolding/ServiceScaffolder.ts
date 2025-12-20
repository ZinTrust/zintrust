/**
 * ServiceScaffolder - Generate microservices within a project
 * Creates service structure with controllers, models, routes, and config
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

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
    const filesCreated: string[] = [];

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

    // Create service directory structure
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

    Logger.info(`✅ Created service directories for '${options.name}'`);

    // Create service config file
    const configPath = path.join(servicePath, 'service.config.json');
    const configContent = generateServiceConfig(options);
    FileGenerator.writeFile(configPath, configContent);

    // Create index.ts (service entry point)
    const indexPath = path.join(servicePath, 'src', 'index.ts');
    const indexContent = generateServiceIndex(options);
    FileGenerator.writeFile(indexPath, indexContent);

    // Create routes file
    const routesPath = path.join(servicePath, 'src', 'routes.ts');
    const routesContent = generateServiceRoutes(options);
    FileGenerator.writeFile(routesPath, routesContent);

    // Create example controller
    const controllerPath = path.join(servicePath, 'src', 'controllers', 'ExampleController.ts');
    const controllerContent = generateExampleController(options);
    FileGenerator.writeFile(controllerPath, controllerContent);

    // Create example model
    const modelPath = path.join(servicePath, 'src', 'models', 'Example.ts');
    const modelContent = generateExampleModel(options);
    FileGenerator.writeFile(modelPath, modelContent);

    // Create .env file
    const envPath = path.join(servicePath, '.env');
    const envContent = generateServiceEnv(options);
    FileGenerator.writeFile(envPath, envContent);

    // Create middleware placeholder
    const middlewarePath = path.join(servicePath, 'src', 'middleware', 'index.ts');
    const middlewareContent = '// Service middleware exports\nexport {};\n';
    FileGenerator.writeFile(middlewarePath, middlewareContent);

    // Create service README
    const readmePath = path.join(servicePath, 'README.md');
    const readmeContent = generateServiceReadme(options);
    FileGenerator.writeFile(readmePath, readmeContent);

    filesCreated.push(
      configPath,
      indexPath,
      routesPath,
      controllerPath,
      modelPath,
      envPath,
      middlewarePath,
      readmePath
    );

    Logger.info(`✅ Generated service '${options.name}' with ${filesCreated.length} files`);

    return {
      success: true,
      serviceName: options.name,
      servicePath,
      filesCreated,
      message: `Service '${options.name}' created successfully at ${servicePath}`,
    };
  } catch (error) {
    Logger.error('Service scaffolding error', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      serviceName: options.name,
      servicePath: '',
      filesCreated: [],
      message: `Failed to create service: ${errorMsg}`,
    };
  }
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

import { Application } from '@/Application';
import { Server } from '@/Server';
import { Logger } from '@config/logger';
import { Env } from '@config/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

import { Request } from '@http/Request';
import { Response } from '@http/Response';

export class ${className} {
  /**
   * List all items
   */
  public async index(_req: Request, res: Response): Promise<void> {
    res.json({ data: [] });
  }

  /**
   * Create new item
   */
  public async store(_req: Request, res: Response): Promise<void> {
    res.setStatus(201).json({ created: true });
  }

  /**
   * Get item by ID
   */
  public async show(req: Request, res: Response): Promise<void> {
    const { id } = req.getParams();
    res.json({ id });
  }

  /**
   * Update item
   */
  public async update(req: Request, res: Response): Promise<void> {
    const { id } = req.getParams();
    res.json({ updated: true, id });
  }

  /**
   * Delete item
   */
  public async destroy(req: Request, res: Response): Promise<void> {
    const { id } = req.getParams();
    res.json({ deleted: true, id });
  }
}
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

export class Example extends Model {
  protected table = '${options.name}';
  protected fillable = ['name', 'description'];
  protected timestamps = true;

  // Define relationships here
  // public async user() { return this.belongsTo(User); }
}
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

export const ServiceScaffolder = {
  validateOptions,
  getServicePath,
  scaffold,
};
