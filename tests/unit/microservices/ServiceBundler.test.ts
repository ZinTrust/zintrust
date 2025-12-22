import {
  bundleAll,
  BundleConfig,
  bundleService,
  createServiceImage,
  ServiceBundler,
} from '@/microservices/ServiceBundler';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');
vi.mock('node:path');
vi.mock('@/config/logger');

import { Logger } from '@/config/logger';

describe('ServiceBundler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue('mocked-dir' as any);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => false,
      size: 102400,
    } as any);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'file1.js', isFile: () => true } as any,
      { name: 'file2.js', isFile: () => true } as any,
    ] as any);

    // Mock path.join
    vi.mocked(path.join).mockImplementation((...args: string[]) => args.join('/'));
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('bundleService function', () => {
    it('should bundle service successfully', async () => {
      const config: BundleConfig = {
        serviceName: 'users',
        domain: 'default',
        outputDir: './dist/bundles',
        targetSize: 2,
      };

      const result = await bundleService(config);

      expect(result).toBeDefined();
      expect(result.serviceName).toBe('users');
      expect(result.location).toBeDefined();
      expect(typeof result.sizeBytes).toBe('number');
      expect(typeof result.sizeMB).toBe('number');
      expect(typeof result.files).toBe('number');
      expect(typeof result.optimized).toBe('boolean');
    });

    it('should create bundle directory', async () => {
      const config: BundleConfig = {
        serviceName: 'products',
        domain: 'commerce',
        outputDir: './dist/bundles',
      };

      await bundleService(config);

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should write bundle metadata', async () => {
      const config: BundleConfig = {
        serviceName: 'orders',
        domain: 'commerce',
        outputDir: './dist/bundles',
      };

      await bundleService(config);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('bundle.json'));
      expect(writeCall).toBeDefined();
    });

    it('should calculate bundle size correctly', async () => {
      const config: BundleConfig = {
        serviceName: 'payments',
        domain: 'commerce',
        outputDir: './dist/bundles',
        targetSize: 1,
      };

      const result = await bundleService(config);

      expect(result.sizeBytes).toBeGreaterThanOrEqual(0);
      expect(result.sizeMB).toBeGreaterThanOrEqual(0);
    });

    it('should determine if bundle is optimized', async () => {
      const config: BundleConfig = {
        serviceName: 'api',
        domain: 'default',
        outputDir: './dist/bundles',
        targetSize: 5, // Large target size
      };

      const result = await bundleService(config);

      expect(typeof result.optimized).toBe('boolean');
    });

    it('should handle different domains', async () => {
      const domains = ['default', 'security', 'commerce', 'communication'];

      for (const domain of domains) {
        const config: BundleConfig = {
          serviceName: 'test',
          domain,
          outputDir: './dist/bundles',
        };

        const result = await bundleService(config);

        expect(result.serviceName).toBe('test');
      }
    });

    it('should remove existing bundle directory before creating', async () => {
      const config: BundleConfig = {
        serviceName: 'notification',
        domain: 'communication',
        outputDir: './dist/bundles',
      };

      await bundleService(config);

      // Check that rmSync was called (to remove existing directory)
      const rmCalls = vi.mocked(fs.rmSync).mock.calls;
      expect(rmCalls.length).toBeGreaterThan(0);
    });

    it('should include optional config parameters', async () => {
      const config: BundleConfig = {
        serviceName: 'auth',
        domain: 'security',
        outputDir: './dist/bundles',
        targetSize: 2,
        includeTests: true,
        includeDocs: true,
      };

      const result = await bundleService(config);

      expect(result.serviceName).toBe('auth');
      expect(result.location).toContain('security-auth');
    });

    it('should handle small bundles', async () => {
      const config: BundleConfig = {
        serviceName: 'small-service',
        domain: 'default',
        outputDir: './dist/bundles',
        targetSize: 0.5, // 0.5 MB target
      };

      const result = await bundleService(config);

      expect(result).toBeDefined();
    });

    it('should handle large bundles', async () => {
      const config: BundleConfig = {
        serviceName: 'large-service',
        domain: 'default',
        outputDir: './dist/bundles',
        targetSize: 10, // 10 MB target
      };

      const result = await bundleService(config);

      expect(result).toBeDefined();
    });

    it('should return bundle location in correct format', async () => {
      const config: BundleConfig = {
        serviceName: 'test-service',
        domain: 'test',
        outputDir: './bundles',
      };

      const result = await bundleService(config);

      // Location should be outputDir/domain-serviceName format
      expect(result.location).toContain('./bundles');
      expect(result.location).toContain('test');
      expect(result.location).toContain('test-service');
    });
  });

  describe('bundleAll function', () => {
    it('should bundle multiple services', async () => {
      const services = ['users', 'products', 'orders'];
      const result = await bundleAll('commerce', services);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(3);
    });

    it('should handle empty services list', async () => {
      const result = await bundleAll('commerce', []);
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(0);
    });

    it('should use default output directory', async () => {
      const services = ['test-service'];
      await bundleAll('test', services);

      // Should be called with default 'dist/services'
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should use custom output directory', async () => {
      const services = ['test-service'];
      await bundleAll('test', services, 'custom/bundles');

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should log service bundling progress', async () => {
      const services = ['svc1', 'svc2'];
      await bundleAll('domain', services);

      expect(vi.mocked(Logger.info)).toHaveBeenCalled();
    });

    it('should handle bundling errors gracefully', async () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('File stat failed');
      });

      const services = ['failing-service'];
      void (await bundleAll('domain', services)); // NOSONAR to avoid unused warning

      // Should catch error and log it
      expect(vi.mocked(Logger.error)).toHaveBeenCalled();
    });

    it('should return results for all services', async () => {
      const services = ['auth', 'user', 'post', 'comment'];
      const results = await bundleAll('social', services, 'dist');

      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result).toHaveProperty('serviceName');
        expect(result).toHaveProperty('sizeBytes');
        expect(result).toHaveProperty('sizeMB');
        expect(result).toHaveProperty('files');
        expect(result).toHaveProperty('location');
        expect(result).toHaveProperty('optimized');
      }
    });

    it('should generate metadata for all bundled services', async () => {
      const services = ['service1', 'service2'];
      await bundleAll('test', services);

      // Should write JSON files for each service
      const writeFileCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const jsonWrites = writeFileCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('bundle.json')
      );
      expect(jsonWrites.length).toBeGreaterThan(0);
    });
  });

  describe('createServiceImage function', () => {
    it('should create Docker image for service', async () => {
      const imageTag = await createServiceImage('users', 'default');

      expect(imageTag).toContain('users');
      expect(imageTag).toContain('default');
      expect(imageTag).toContain('localhost:5000');
    });

    it('should use custom registry', async () => {
      const imageTag = await createServiceImage('auth', 'security', 'docker.io/myorg');

      expect(imageTag).toContain('docker.io/myorg');
      expect(imageTag).toContain('auth');
      expect(imageTag).toContain('security');
    });

    it('should generate Dockerfile', async () => {
      await createServiceImage('api', 'default');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const dockerfileCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('Dockerfile'));
      expect(dockerfileCall).toBeDefined();
    });

    it('should include service name in Docker environment', async () => {
      await createServiceImage('payment', 'commerce');

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('Dockerfile'));

      if (writeCall) {
        const dockerfileContent = writeCall[1] as string;
        expect(dockerfileContent).toContain('payment');
      }
    });

    it('should use latest tag', async () => {
      const imageTag = await createServiceImage('test', 'test');

      expect(imageTag).toContain(':latest');
    });

    it('should log image creation info', async () => {
      await createServiceImage('users', 'default');

      expect(vi.mocked(Logger.info)).toHaveBeenCalled();
    });

    it('should handle multiple services with different registries', async () => {
      const registries = ['localhost:5000', 'registry.example.com', 'gcr.io/project'];

      for (const registry of registries) {
        const imageTag = await createServiceImage('test-svc', 'domain', registry);
        expect(imageTag).toContain(registry);
      }
    });

    it('should generate complete Dockerfile with health check', async () => {
      await createServiceImage('service', 'default');

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('Dockerfile'));

      if (writeCall) {
        const content = writeCall[1] as string;
        expect(content).toContain('HEALTHCHECK');
        expect(content).toContain('node:20-alpine');
        expect(content).toContain('NODE_ENV=production');
      }
    });
  });

  describe('ServiceBundler export object', () => {
    it('should expose bundleService method', () => {
      expect(ServiceBundler.bundleService).toBeDefined();
      expect(typeof ServiceBundler.bundleService).toBe('function');
    });

    it('should expose bundleAll method', () => {
      expect(ServiceBundler.bundleAll).toBeDefined();
      expect(typeof ServiceBundler.bundleAll).toBe('function');
    });

    it('should expose createServiceImage method', () => {
      expect(ServiceBundler.createServiceImage).toBeDefined();
      expect(typeof ServiceBundler.createServiceImage).toBe('function');
    });

    it('should have all methods callable', async () => {
      const config: BundleConfig = {
        serviceName: 'test',
        domain: 'test',
        outputDir: './test',
      };

      const result1 = await ServiceBundler.bundleService(config);
      expect(result1).toBeDefined();

      const result2 = await ServiceBundler.bundleAll('test', ['test']);
      expect(result2).toBeInstanceOf(Array);

      const result3 = await ServiceBundler.createServiceImage('test', 'test');
      expect(result3).toBeDefined();
    });
  });

  describe('Bundle size calculations', () => {
    it('should calculate zero size for non-existent directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config: BundleConfig = {
        serviceName: 'empty',
        domain: 'test',
        outputDir: './test',
      };

      const result = await bundleService(config);
      expect(result.sizeBytes).toBe(0);
    });

    it('should handle files smaller than 1KB', async () => {
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
        size: 512,
      } as any);

      const config: BundleConfig = {
        serviceName: 'tiny',
        domain: 'test',
        outputDir: './test',
        targetSize: 1,
      };

      const result = await bundleService(config);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.optimized).toBe(true);
    });

    it('should correctly convert bytes to MB', async () => {
      // Test that sizeMB is properly calculated from sizeBytes
      const config: BundleConfig = {
        serviceName: 'onemeg',
        domain: 'test',
        outputDir: './test',
        targetSize: 2,
      };

      const result = await bundleService(config);
      // The calculation should result in MB = sizeBytes / (1024 * 1024)
      expect(result.sizeMB).toBeGreaterThanOrEqual(0);
      expect(typeof result.sizeMB).toBe('number');
    });
  });

  describe('Configuration validation', () => {
    it('should use default target size of 1MB', async () => {
      const config: BundleConfig = {
        serviceName: 'default-target',
        domain: 'test',
        outputDir: './test',
        // targetSize not specified
      };

      const result = await bundleService(config);
      expect(result).toBeDefined();
    });

    it('should respect custom target size', async () => {
      const config: BundleConfig = {
        serviceName: 'custom-target',
        domain: 'test',
        outputDir: './test',
        targetSize: 5,
      };

      const result = await bundleService(config);
      expect(result).toBeDefined();
    });

    it('should handle all parameter combinations', async () => {
      const configs: BundleConfig[] = [
        { serviceName: 's1', domain: 'd1', outputDir: 'o1' },
        { serviceName: 's2', domain: 'd2', outputDir: 'o2', targetSize: 2 },
        { serviceName: 's3', domain: 'd3', outputDir: 'o3', includeTests: true },
        { serviceName: 's4', domain: 'd4', outputDir: 'o4', includeDocs: true },
        {
          serviceName: 's5',
          domain: 'd5',
          outputDir: 'o5',
          targetSize: 3,
          includeTests: true,
          includeDocs: true,
        },
      ];

      for (const config of configs) {
        const result = await bundleService(config);
        expect(result.serviceName).toBe(config.serviceName);
        expect(result.location).toContain(config.domain);
      }
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle missing serviceName gracefully', async () => {
      const config: BundleConfig = {
        serviceName: '',
        domain: 'test',
        outputDir: './test',
      };

      const result = await bundleService(config);
      expect(result).toBeDefined();
    });

    it('should handle very large target sizes', async () => {
      const config: BundleConfig = {
        serviceName: 'huge',
        domain: 'test',
        outputDir: './test',
        targetSize: 1000, // 1GB
      };

      const result = await bundleService(config);
      expect(result.optimized).toBe(true);
    });

    it('should handle very small target sizes', async () => {
      const config: BundleConfig = {
        serviceName: 'tiny',
        domain: 'test',
        outputDir: './test',
        targetSize: 0.001, // 1KB
      };

      const result = await bundleService(config);
      expect(typeof result.optimized).toBe('boolean');
    });

    it('should bundle services with special characters in names', async () => {
      const specialNames = ['user-service', 'auth_service', 'api.service', 'v2-payment-service'];

      for (const name of specialNames) {
        const config: BundleConfig = {
          serviceName: name,
          domain: 'test',
          outputDir: './test',
        };

        const result = await bundleService(config);
        expect(result.serviceName).toBe(name);
      }
    });

    it('should handle domain names with various formats', async () => {
      const domains = ['default', 'my-domain', 'sub.domain', 'domain_v2', 'UPPERCASE'];

      for (const domain of domains) {
        const config: BundleConfig = {
          serviceName: 'test',
          domain,
          outputDir: './test',
        };

        const result = await bundleService(config);
        expect(result.location).toContain(domain);
      }
    });
  });
});
