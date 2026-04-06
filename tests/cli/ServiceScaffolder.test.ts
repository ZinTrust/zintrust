/**
 * ServiceScaffolder Tests
 */

/* eslint-disable max-nested-callbacks */
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { ServiceScaffolder, type ServiceOptions } from '@cli/scaffolding/ServiceScaffolder';
import { default as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDir = path.join(__dirname, 'test-services');

describe('ServiceScaffolder Validation', () => {
  describe('validateOptions', () => {
    it('should validate correct options', () => {
      const options: ServiceOptions = {
        name: 'users',
        domain: 'ecommerce',
        port: 3001,
      };

      const result = ServiceScaffolder.validateOptions(options);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject empty name', () => {
      const options: ServiceOptions = { name: '' };
      const result = ServiceScaffolder.validateOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('name is required'))).toBe(true);
    });

    it('should reject invalid service name (uppercase)', () => {
      const options: ServiceOptions = { name: 'Users' };
      const result = ServiceScaffolder.validateOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('lowercase letters'))).toBe(true);
    });

    it('should reject invalid port', () => {
      const options: ServiceOptions = { name: 'users', port: 99999 };
      const result = ServiceScaffolder.validateOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Port must be'))).toBe(true);
    });

    it('should reject invalid domain', () => {
      const options: ServiceOptions = { name: 'users', domain: 'MyDomain' };
      const result = ServiceScaffolder.validateOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('lowercase letters'))).toBe(true);
    });
  });
});

describe('ServiceScaffolder Path Generation', () => {
  describe('getServicePath', () => {
    it('should generate correct service path', () => {
      const options: ServiceOptions = { name: 'users', domain: 'ecommerce' };
      const servicePath = ServiceScaffolder.getServicePath(testDir, options);

      expect(servicePath).toContain('src/services/ecommerce/users');
    });

    it('should use default domain if not provided', () => {
      const options: ServiceOptions = { name: 'users' };
      const servicePath = ServiceScaffolder.getServicePath(testDir, options);

      expect(servicePath).toContain('src/services/default/users');
    });
  });
});

describe('ServiceScaffolder Scaffolding Basic', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('scaffold Basic', () => {
    it('should create service with all files', async () => {
      fs.writeFileSync(
        path.join(testDir, '.zintrust.json'),
        JSON.stringify(
          {
            name: 'test-app',
            cloudflare: {
              shared_env: ['APP_KEY'],
              targets: {
                worker: [],
              },
            },
          },
          null,
          2
        )
      );

      const options: ServiceOptions = {
        name: 'users',
        domain: 'ecommerce',
        port: 3001,
        database: 'shared',
      };

      const result = await ServiceScaffolder.scaffold(testDir, options);

      expect(result.success).toBe(true);
      expect(result.filesCreated.length).toBeGreaterThan(0);
      expect(result.filesCreated.some((f: string) => f.includes('service.config.json'))).toBe(true);

      const runtimePath = path.join(testDir, 'src', 'zintrust.runtime.ts');
      const manifestPath = path.join(testDir, 'src', 'bootstrap', 'service-manifest.ts');
      const wranglerPath = path.join(
        testDir,
        'src',
        'services',
        'ecommerce',
        'users',
        'wrangler.jsonc'
      );
      expect(fs.existsSync(runtimePath)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(fs.existsSync(wranglerPath)).toBe(true);

      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      expect(manifestContent).toContain("id: 'ecommerce/users'");
      expect(manifestContent).toContain("prefix: 'ecommerce/users'");
      expect(manifestContent).toContain('loadEnv: false');
      expect(manifestContent).toContain(
        "loadRoutes: async () => import('../services/ecommerce/users/routes/api.ts').catch(() => import('../services/ecommerce/users/routes/api.js'))"
      );

      const wranglerContent = fs.readFileSync(wranglerPath, 'utf-8');
      expect(wranglerContent).toContain('"@routes/api.ts": "./routes/api.ts"');
      expect(wranglerContent).toContain('"@service-runtime-config/cache.ts": "./config/cache.ts"');
      expect(wranglerContent).toContain(
        '"@runtime-config/cache.ts": "../../../../config/cache.ts"'
      );
      expect(wranglerContent).toContain(
        '"../zintrust.runtime.wg.js": "../../../../src/zintrust.runtime.wg.ts"'
      );

      const config = JSON.parse(fs.readFileSync(path.join(testDir, '.zintrust.json'), 'utf-8'));
      expect(config.cloudflare.targets['ecommerce/users']).toEqual([]);
    });

    it('should reject existing service', async () => {
      const options: ServiceOptions = { name: 'users', domain: 'ecommerce' };

      // First scaffold
      const result1 = await ServiceScaffolder.scaffold(testDir, options);
      expect(result1.success).toBe(true);

      // Try to scaffold same service
      const result2 = await ServiceScaffolder.scaffold(testDir, options);
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('already exists');
    });
  });
});

describe('ServiceScaffolder Scaffolding Files Basic', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('scaffold Files Basic', () => {
    it('should create service config file', async () => {
      const options: ServiceOptions = {
        name: 'users',
        database: 'isolated',
        auth: 'jwt',
      };

      const result = await ServiceScaffolder.scaffold(testDir, options);
      expect(result.success).toBe(true);

      const configPath = result.filesCreated.find((f: string) => f.includes('service.config.json'));
      expect(configPath).toBeDefined();

      if (configPath !== undefined && configPath !== null) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);

        expect(config.auth.strategy).toBe('jwt');
      }
    });
  });
});

describe('ServiceScaffolder Scaffolding Files Index and Routes', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('scaffold Files Index and Routes', () => {
    it('should create service index.ts', async () => {
      const options: ServiceOptions = { name: 'payments', port: 3002 };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const indexPath = result.filesCreated.find((f: string) => f.includes('index.ts'));
      expect(indexPath).toBeDefined();

      if (indexPath !== undefined && indexPath !== null) {
        const content = fs.readFileSync(indexPath, 'utf-8');
        expect(content).toContain('payments');
        expect(content).toContain('3002');
        expect(content).toContain("from '@zintrust/core/start'");
        expect(content).toContain('bootStandaloneService(import.meta.url, {');
        expect(content).toContain("configRoot: 'src/services/default/payments/config'");
      }
    });

    it('should create service routes/api.ts', async () => {
      const options: ServiceOptions = { name: 'orders' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const routesPath = result.filesCreated.find((f: string) => f.includes('routes/api.ts'));
      expect(routesPath).toBeDefined();

      if (typeof routesPath === 'string' && routesPath !== '') {
        const content = fs.readFileSync(routesPath, 'utf-8');
        expect(content).toContain("from '@zintrust/core'");
        expect(content).toContain('registerRoutes');
        expect(content).toContain('Router.get');
      }
    });
  });
});

describe('ServiceScaffolder Scaffolding Files Advanced', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('scaffold Files Advanced', () => {
    it('should create service controller', async () => {
      const options: ServiceOptions = { name: 'users' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const controllerPath = result.filesCreated.find((f: string) =>
        f.includes('ExampleController')
      );
      expect(controllerPath).toBeDefined();

      if (typeof controllerPath === 'string' && controllerPath !== '') {
        const content = fs.readFileSync(controllerPath, 'utf-8');
        expect(content).toContain('index');
        expect(content).toContain('store');
        expect(content).toContain('show');
      }
    });

    it('should create service model', async () => {
      const options: ServiceOptions = { name: 'products' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const modelPath = result.filesCreated.find((f: string) => f.includes('Example.ts'));
      expect(modelPath).toBeDefined();

      if (typeof modelPath === 'string' && modelPath !== '') {
        const content = fs.readFileSync(modelPath, 'utf-8');
        expect(content).toContain('Model');
        expect(content).toContain('products');
      }
    });
  });
});

describe('ServiceScaffolder Scaffolding Files Env and Readme', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('scaffold Files Env and Readme', () => {
    it('should create service .env file', async () => {
      const options: ServiceOptions = { name: 'users', port: 3001 };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const envPath = result.filesCreated.find((f: string) => f.endsWith('.env'));
      expect(envPath).toBeDefined();

      if (typeof envPath === 'string' && envPath !== '') {
        const content = fs.readFileSync(envPath, 'utf-8');
        expect(content).toContain('USERS_PORT');
        expect(content).toContain('3001');
      }
    });

    it('should create service README', async () => {
      const options: ServiceOptions = { name: 'users' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const readmePath = result.filesCreated.find((f: string) => f.includes('README.md'));
      expect(readmePath).toBeDefined();

      if (typeof readmePath === 'string' && readmePath !== '') {
        const content = fs.readFileSync(readmePath, 'utf-8');
        expect(content).toContain('users');
        expect(content).toContain('zin s');
        expect(content).toContain('zin s --wg');
        expect(content).toContain('MICROSERVICES=true SERVICES=default/users zin routes');
      }
    });

    it('should generate runtime modules that can import source or built manifests', async () => {
      const options: ServiceOptions = { name: 'users', domain: 'ecommerce' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      expect(result.success).toBe(true);

      const runtimePath = path.join(testDir, 'src', 'zintrust.runtime.ts');
      const runtimeContent = fs.readFileSync(runtimePath, 'utf-8');
      expect(runtimeContent).toContain("import('./bootstrap/service-manifest.ts')");
      expect(runtimeContent).toContain("import('./bootstrap/service-manifest.js')");
    });

    it('should create service-local wrangler config with root-mapped aliases', async () => {
      const options: ServiceOptions = { name: 'users', domain: 'ecommerce', port: 3010 };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const wranglerPath = result.filesCreated.find((f: string) => f.endsWith('wrangler.jsonc'));
      expect(wranglerPath).toBeDefined();

      if (typeof wranglerPath === 'string' && wranglerPath !== '') {
        const content = fs.readFileSync(wranglerPath, 'utf-8');
        expect(content).toContain('"name": "ecommerce-users"');
        expect(content).toContain('"main": "./src/index.ts"');
        expect(content).toContain('"@routes/api.ts": "./routes/api.ts"');
        expect(content).toContain('"@service-runtime-config/database.ts": "./config/database.ts"');
        expect(content).toContain(
          '"@runtime-config/database.ts": "../../../../config/database.ts"'
        );
        expect(content).toContain(
          '"../zintrust.plugins.wg.js": "../../../../src/zintrust.plugins.wg.ts"'
        );
        expect(content).toContain('"NODE_ENV": "development"');
        expect(content).toContain('"HOST": "ecommerce-users.workers.dev"');
        expect(content).toContain('"BASE_URL": "https://ecommerce-users.workers.dev"');
        expect(content).toContain('"STARTUP_REQUIRE_ENV": "true"');
        expect(content).toContain('"LOG_CHANNEL": "console"');
        expect(content).not.toContain('"ENCRYPTION_CIPHER"');
        expect(content).toContain('"SERVICE_DOMAIN": "ecommerce"');
        expect(content).toContain('"SERVICE_PORT": "3010"');
      }
    });
  });
});

describe('ServiceScaffolder Scaffolding Directories', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('scaffold Directories', () => {
    it('should create all expected directories', async () => {
      const options: ServiceOptions = { name: 'users', domain: 'test' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      expect(result.success).toBe(true);

      const servicePath = ServiceScaffolder.getServicePath(testDir, options);
      expect(FileGenerator.directoryExists(path.join(servicePath, 'src', 'controllers'))).toBe(
        true
      );
      expect(FileGenerator.directoryExists(path.join(servicePath, 'config'))).toBe(true);
      expect(FileGenerator.directoryExists(path.join(servicePath, 'src', 'models'))).toBe(true);
      expect(FileGenerator.directoryExists(path.join(servicePath, 'src', 'services'))).toBe(true);
    });
  });
});
