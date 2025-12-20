/**
 * ServiceScaffolder Tests
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { ServiceScaffolder, type ServiceOptions } from '@cli/scaffolding/ServiceScaffolder';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDir = path.join(__dirname, 'test-services');

describe('ServiceScaffolder', () => {
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

  describe('scaffold', () => {
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

      if (configPath != null) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);

        expect(config.name).toBe('users');
        expect(config.database.isolation).toBe('isolated');
        expect(config.auth.strategy).toBe('jwt');
      }
    });

    it('should create service index.ts', async () => {
      const options: ServiceOptions = { name: 'payments', port: 3002 };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const indexPath = result.filesCreated.find((f: string) => f.includes('index.ts'));
      expect(indexPath).toBeDefined();

      if (indexPath != null) {
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

      if (typeof routesPath === 'string') {
        const content = fs.readFileSync(routesPath, 'utf-8');
        expect(content).toContain('router');
      }
    });

    it('should create service controller', async () => {
      const options: ServiceOptions = { name: 'users' };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const controllerPath = result.filesCreated.find((f: string) =>
        f.includes('ExampleController')
      );
      expect(controllerPath).toBeDefined();

      if (typeof controllerPath === 'string') {
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

      if (typeof modelPath === 'string') {
        const content = fs.readFileSync(modelPath, 'utf-8');
        expect(content).toContain('Model');
        expect(content).toContain('products');
      }
    });

    it('should create service .env file', async () => {
      const options: ServiceOptions = { name: 'users', port: 3001 };
      const result = await ServiceScaffolder.scaffold(testDir, options);

      const envPath = result.filesCreated.find((f: string) => f.endsWith('.env'));
      expect(envPath).toBeDefined();

      if (typeof envPath === 'string') {
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

      if (typeof readmePath === 'string') {
        const content = fs.readFileSync(readmePath, 'utf-8');
        expect(content).toContain('users');
      }
    });

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
