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
      }
    });

    it('should create service routes.ts', async () => {
      const options: ServiceOptions = { name: 'orders' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const routesPath = result.filesCreated.find((f: string) => f.includes('routes.ts'));
      expect(routesPath).toBeDefined();

      if (typeof routesPath === 'string' && routesPath !== '') {
        const content = fs.readFileSync(routesPath, 'utf-8');
        expect(content).toContain('router');
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
      expect(FileGenerator.directoryExists(path.join(servicePath, 'src', 'models'))).toBe(true);
      expect(FileGenerator.directoryExists(path.join(servicePath, 'src', 'services'))).toBe(true);
    });
  });
});
