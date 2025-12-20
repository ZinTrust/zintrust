/**
 * Microservice generator - auto-creates microservice folder structure
 * Generates boilerplate code for domain-driven microservices
 */

import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';

export interface GenerateServiceOptions {
  domain: string; // e.g., 'ecommerce'
  services: string[]; // e.g., ['users', 'orders', 'payments']
  basePort?: number; // e.g., 3001
  version?: string; // e.g., '1.0.0'
}

/**
 * Microservice code generator
 */

/**
 * Generate microservices folder structure
 */
export async function generate(options: GenerateServiceOptions): Promise<void> {
  const { domain, services, basePort = 3001, version = '1.0.0' } = options;

  Logger.info(`\n🏗️  Generating microservices for domain: ${domain}`);
  Logger.info(`📦 Services: ${services.join(', ')}\n`);

  for (let i = 0; i < services.length; i++) {
    const serviceName = services[i];
    const servicePort = basePort + i;

    await generateService({
      domain,
      serviceName,
      port: servicePort,
      version,
    });
  }

  // Generate shared utils
  await generateSharedUtils(domain);

  // Generate docker-compose for local dev
  await generateDockerCompose(domain, services, basePort);

  Logger.info(`✅ Microservices generated in services/${domain}/\n`);
}

/**
 * Generate individual microservice
 */
async function generateService(config: {
  domain: string;
  serviceName: string;
  port: number;
  version: string;
}): Promise<void> {
  const { domain, serviceName, port, version } = config;
  const serviceDir = `services/${domain}/${serviceName}`;

  // Create directories
  const dirs = [
    serviceDir,
    `${serviceDir}/src`,
    `${serviceDir}/src/http/Controllers`,
    `${serviceDir}/src/http/Middleware`,
    `${serviceDir}/src/models`,
    `${serviceDir}/src/routes`,
    `${serviceDir}/database/migrations`,
    `${serviceDir}/database/seeders`,
    `${serviceDir}/tests/Feature`,
    `${serviceDir}/tests/Unit`,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Generate files
  await generateServiceConfig(serviceDir, serviceName, port, version);
  await generateServiceKernel(serviceDir, serviceName, domain);
  await generateServiceRoutes(serviceDir, serviceName);
  await generateServiceController(serviceDir, serviceName);
  await generateServiceModel(serviceDir, serviceName);
  await generateServiceTest(serviceDir, serviceName);
  await generateServicePackageJson(serviceDir, serviceName, version);
  await generateServiceReadme(serviceDir, serviceName, domain, port);

  Logger.info(`  ✓ Generated: ${serviceName}`);
}

async function generateServiceConfig(
  serviceDir: string,
  serviceName: string,
  port: number,
  version: string
): Promise<void> {
  const config = {
    name: serviceName,
    version,
    port,
    description: `${serviceName} microservice`,
    dependencies: [],
    healthCheck: '/health',
  };

  fs.writeFileSync(path.join(serviceDir, 'service.config.json'), JSON.stringify(config, null, 2));
}

async function generateServiceKernel(
  serviceDir: string,
  serviceName: string,
  domain: string
): Promise<void> {
  const code = `import { Application } from '@http/Application';
import { Kernel } from '@http/Kernel';
import { ServiceRegistry } from '@microservices/MicroserviceManager';

/**
 * ${serviceName} Microservice Kernel
 * Domain: ${domain}
 */
export class ${pascalCase(serviceName)}Kernel extends Kernel {
  constructor(app: Application) {
    super(app);
    this.registerRoutes();
    this.registerMiddleware();
  }

  private registerRoutes(): void {
    // Import and register routes
    // import routes from './src/routes';
    // routes(this.router);
  }

  private registerMiddleware(): void {
    // Register service-specific middleware
    // this.middleware.register(authMiddleware);
  }

  /**
   * Service health check
   */
  async health(): Promise<ServiceHealth> {
    return {
      status: 'healthy',
      service: '${serviceName}',
      timestamp: new Date().toISOString(),
    };
  }
}

interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
}

export default new ${pascalCase(serviceName)}Kernel(new Application());
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'Kernel.ts'), code);
}

async function generateServiceRoutes(serviceDir: string, serviceName: string): Promise<void> {
  const code = `import { Router } from '@routing/EnhancedRouter';

/**
 * ${serviceName} service routes
 */
export default function routes(router: Router): void {
  router.group({ prefix: '/api/${serviceName}' }, () => {
    // Health check
    router.get('/health', '${pascalCase(serviceName)}Controller@health');

    // TODO: Add your routes here
    // router.get('/', '${pascalCase(serviceName)}Controller@index');
    // router.get('/:id', '${pascalCase(serviceName)}Controller@show');
    // router.post('/', '${pascalCase(serviceName)}Controller@store');
  });
}
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'routes', 'index.ts'), code);
}

async function generateServiceController(serviceDir: string, serviceName: string): Promise<void> {
  const code = `import { Controller } from '@http/Controller';
import { Request } from '@http/Request';
import { Response } from '@http/Response';

/**
 * ${pascalCase(serviceName)} Controller
 */
export class ${pascalCase(serviceName)}Controller extends Controller {
  /**
   * Health check
   */
  async health(_req: Request, res: Response): Promise<void> {
    res.json({ status: 'ok', service: '${serviceName}' }, 200);
  }

  // TODO: Add your controller methods here
  /*
  async index(req: Request, res: Response): Promise<void> {
    // List all ${serviceName}
  }

  async show(req: Request, res: Response): Promise<void> {
    // Show specific ${serviceName}
  }

  async store(req: Request, res: Response): Promise<void> {
    // Create new ${serviceName}
  }

  async update(req: Request, res: Response): Promise<void> {
    // Update ${serviceName}
  }

  async destroy(req: Request, res: Response): Promise<void> {
    // Delete ${serviceName}
  }
  */
}
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'node:http', 'Controllers', 'index.ts'), code);
}

async function generateServiceModel(serviceDir: string, serviceName: string): Promise<void> {
  const modelName = pascalCase(serviceName.slice(0, -1)); // Remove 's'
  const code = `import { Model } from '@orm/Model';

/**
 * ${modelName} Model
 */
export class ${modelName} extends Model {
  protected table = '${serviceName}';

  protected fillable = [
    // TODO: Add fillable attributes
  ];

  protected hidden = [
    // 'password',
  ];

  protected casts = {
    // 'created_at': 'datetime',
    // 'updated_at': 'datetime',
  };
}
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'models', 'index.ts'), code);
}

async function generateServiceTest(serviceDir: string, serviceName: string): Promise<void> {
  const code = `import { describe, it, expect } from 'vitest';

/**
 * ${serviceName} tests
 */
describe('${serviceName} service', () => {
  it('should have health check endpoint', async () => {
    // TODO: Implement tests
    expect(true).toBe(true);
  });

  // TODO: Add more tests
  /*
  it('should list ${serviceName}', async () => {
    // GET /api/${serviceName}
  });

  it('should create ${serviceName}', async () => {
    // POST /api/${serviceName}
  });
  */
});
`;

  fs.writeFileSync(path.join(serviceDir, 'tests', 'Feature', 'Example.test.ts'), code);
}

async function generateServicePackageJson(
  serviceDir: string,
  serviceName: string,
  version: string
): Promise<void> {
  const pkg = {
    name: `@zintrust/${serviceName}`,
    version,
    description: `${serviceName} microservice`,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      test: 'vitest',
    },
  };

  fs.writeFileSync(path.join(serviceDir, 'package.json'), JSON.stringify(pkg, null, 2));
}

async function generateServiceReadme(
  serviceDir: string,
  serviceName: string,
  domain: string,
  port: number
): Promise<void> {
  const readme = `# ${serviceName} Microservice

Domain: \`${domain}\`

## Description

${serviceName} microservice for Zintrust framework.

## Port

\`\`\`
${port}
\`\`\`

## Getting Started

### Development

\`\`\`bash
cd services/${domain}/${serviceName}
npm install
npm run dev
\`\`\`

### Testing

\`\`\`bash
npm test
\`\`\`

### Build

\`\`\`bash
npm run build
\`\`\`

## API Endpoints

- \`GET /api/${serviceName}/health\` - Health check

## Environment Variables

\`\`\`bash
SERVICE_NAME=${serviceName}
SERVICE_PORT=${port}
DB_CONNECTION=postgresql
\`\`\`

## Inter-Service Communication

Call another service:

\`\`\`typescript
import { MicroserviceManager } from '@microservices/MicroserviceManager';

const manager = MicroserviceManager.getInstance();
const response = await manager.callService('other-service', {
  method: 'GET',
  path: '/api/other-service/data',
});
\`\`\`

## Dependencies

- Zintrust Framework
`;

  fs.writeFileSync(path.join(serviceDir, 'README.md'), readme);
}

async function generateSharedUtils(domain: string): Promise<void> {
  const sharedDir = `services/${domain}/shared`;

  if (!fs.existsSync(sharedDir)) {
    fs.mkdirSync(sharedDir, { recursive: true });
  }

  // Generate shared types
  const typesFile = `${sharedDir}/types.ts`;
  if (!fs.existsSync(typesFile)) {
    const code = `/**
 * Shared types for ${domain} domain
 */

// TODO: Define shared types
`;
    fs.writeFileSync(typesFile, code);
  }

  // Generate shared utils
  const utilsFile = `${sharedDir}/utils.ts`;
  if (!fs.existsSync(utilsFile)) {
    const code = `/**
 * Shared utilities for ${domain} domain
 */

// TODO: Define shared utilities
`;
    fs.writeFileSync(utilsFile, code);
  }
}

async function generateDockerCompose(
  domain: string,
  services: string[],
  basePort: number
): Promise<void> {
  const services_config = services
    .map((service, i) => {
      const port = basePort + i;
      return `  ${service}:
    build:
      context: .
      dockerfile: services/${domain}/${service}/Dockerfile
    ports:
      - "${port}:3000"
    environment:
      NODE_ENV: development
      MICROSERVICES: "true"
      SERVICE_NAME: ${service}
      SERVICE_PORT: 3000
    depends_on:
      - postgres
      - redis
`;
    })
    .join('\n');

  const compose = `version: '3.9'

services:
${services_config}
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: zintrust
      POSTGRES_USER: zintrust
      POSTGRES_PASSWORD: zintrust
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
`;

  fs.writeFileSync(`services/${domain}/docker-compose.yml`, compose);
}

function pascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export const MicroserviceGenerator = {
  generate,
};

/**
 * CLI command to generate microservices
 */
export async function generateMicroservices(
  domain: string,
  services: string[],
  port: number = 3001
): Promise<void> {
  try {
    await MicroserviceGenerator.generate({
      domain,
      services: services.map((s: string) => s.trim()),
      basePort: port,
    });
    Logger.info('✅ Microservices generated successfully!');
  } catch (error) {
    Logger.error('❌ Error generating microservices:', (error as Error).message);
    process.exit(1);
  }
}
