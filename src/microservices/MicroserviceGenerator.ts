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

export interface IMicroserviceGenerator {
  generate(options: GenerateServiceOptions): Promise<void>;
}

/**
 * Microservice code generator
 */
export const MicroserviceGenerator = Object.freeze(
  (): {
    getInstance(): IMicroserviceGenerator;
    create(): IMicroserviceGenerator;
  } => {
    let instance: IMicroserviceGenerator | undefined;

    return {
      getInstance(): IMicroserviceGenerator {
        instance ??= this.create();
        return instance;
      },

      /**
       * Create a new microservice generator instance
       */
      create(): IMicroserviceGenerator {
        return {
          /**
           * Generate microservices folder structure
           */
          async generate(options: GenerateServiceOptions): Promise<void> {
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
          },
        };
      },
    };
  }
)();

const pascalCase = (str: string): string => {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
};

const buildReadmeHeader = (serviceName: string, domain: string, port: number): string => {
  return `# ${serviceName} Microservice

Domain: \`${domain}\`

## Description

${serviceName} microservice for Zintrust framework.

## Port

\`\`\`
${port}
\`\`\``;
};

const buildReadmeGettingStarted = (domain: string, serviceName: string): string => {
  return `## Getting Started

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
\`\`\``;
};

const buildReadmeApiInfo = (serviceName: string, port: number): string => {
  return `## API Endpoints

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

- Zintrust Framework`;
};

const generateServiceConfig = async (
  serviceDir: string,
  serviceName: string,
  port: number,
  version: string
): Promise<void> => {
  const config = {
    name: serviceName,
    version,
    port,
    description: `${serviceName} microservice`,
    dependencies: [],
    healthCheck: '/health',
  };

  fs.writeFileSync(path.join(serviceDir, 'service.config.json'), JSON.stringify(config, null, 2));
};

const generateServiceKernel = async (
  serviceDir: string,
  serviceName: string,
  domain: string
): Promise<void> => {
  const code = `import { Application } from '@http/Application';
import { Kernel, IKernel } from '@http/Kernel';

/**
 * ${serviceName} Microservice Kernel
 * Domain: ${domain}
 */
export const ${pascalCase(serviceName)}Kernel = {
  create(app: Application): IKernel {
    const kernel = Kernel.create(app);

    // Register service-specific logic here
    // kernel.router.get('/health', (req, res) => res.json({ status: 'ok' }));

    return kernel;
  }
};

export default ${pascalCase(serviceName)}Kernel.create(Application.create());
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'Kernel.ts'), code);
};

const generateServiceRoutes = async (serviceDir: string, serviceName: string): Promise<void> => {
  const code = `import { IRouter } from '@routing/Router';

/**
 * ${serviceName} service routes
 */
export default function routes(router: IRouter): void {
  router.group({ prefix: '/api/${serviceName}' }, () => {
    // Health check
    router.get('/health', '${pascalCase(serviceName)}Controller@health');

    // TODO: Add your routes here
    // router.get('/', '${pascalCase(serviceName)}Controller@index');
  });
}
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'routes', 'index.ts'), code);
};

const generateServiceController = async (
  serviceDir: string,
  serviceName: string
): Promise<void> => {
  const code = `import { Controller, IController } from '@http/Controller';
import { Request } from '@http/Request';
import { Response } from '@http/Response';

/**
 * ${pascalCase(serviceName)} Controller
 */
export interface I${pascalCase(serviceName)}Controller extends IController {
  health(req: Request, res: Response): Promise<void>;
}

export const ${pascalCase(serviceName)}Controller = {
  create(): I${pascalCase(serviceName)}Controller {
    return {
      ...Controller.create(),
      /**
       * Health check
       */
      async health(_req: Request, res: Response): Promise<void> {
        res.json({ status: 'ok', service: '${serviceName}' }, 200);
      },
    };
  }
};
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'http', 'Controllers', 'index.ts'), code);
};

const generateServiceModel = async (serviceDir: string, serviceName: string): Promise<void> => {
  const modelName = pascalCase(serviceName.slice(0, -1)); // Remove 's'
  const code = `import { Model } from '@orm/Model';

/**
 * ${modelName} Model
 */
export const ${modelName} = Model.define('${serviceName}', {
  fillable: [
    // TODO: Add fillable attributes
  ],
  hidden: [
    // 'password',
  ],
  casts: {
    // 'created_at': 'datetime',
  },
});
`;

  fs.writeFileSync(path.join(serviceDir, 'src', 'models', 'index.ts'), code);
};

const generateServiceTest = async (serviceDir: string, serviceName: string): Promise<void> => {
  const code = `import { describe, it, expect } from 'vitest';

/**
 * ${serviceName} tests
 */
describe('${serviceName} service', () => {
  it('should have health check endpoint', async () => {
    // TODO: Implement tests
    expect(true).toBe(true);
  });
});
`;

  fs.writeFileSync(path.join(serviceDir, 'tests', 'Feature', 'Example.test.ts'), code);
};

const generateServicePackageJson = async (
  serviceDir: string,
  serviceName: string,
  version: string
): Promise<void> => {
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
};

const generateServiceReadme = async (
  serviceDir: string,
  serviceName: string,
  domain: string,
  port: number
): Promise<void> => {
  const readme = `${buildReadmeHeader(serviceName, domain, port)}

${buildReadmeGettingStarted(domain, serviceName)}

${buildReadmeApiInfo(serviceName, port)}`;

  fs.writeFileSync(path.join(serviceDir, 'README.md'), readme);
};

const generateService = async (config: {
  domain: string;
  serviceName: string;
  port: number;
  version: string;
}): Promise<void> => {
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
};

const generateSharedUtils = async (domain: string): Promise<void> => {
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
};

const generateDockerCompose = async (
  domain: string,
  services: string[],
  basePort: number
): Promise<void> => {
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
    await MicroserviceGenerator.getInstance().generate({
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

export const generate = (options: GenerateServiceOptions): Promise<void> =>
  MicroserviceGenerator.getInstance().generate(options);

export default MicroserviceGenerator;
