/**
 * FeatureScaffolder Tests
 */

import { FeatureScaffolder, type FeatureOptions } from '@cli/scaffolding/FeatureScaffolder';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const testDir = path.join(__dirname, 'test-features');

describe('FeatureScaffolder', () => {
  let servicePath: string;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // Create test service structure
    servicePath = path.join(testDir, 'test-service');
    const featureDir = path.join(servicePath, 'src', 'features');
    fs.mkdirSync(featureDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('getAvailableFeatures', () => {
    it('should return list of available features', () => {
      const features = FeatureScaffolder.getAvailableFeatures();

      expect(features.length).toBeGreaterThan(0);
      expect(features).toContain('auth');
      expect(features).toContain('payments');
      expect(features).toContain('logging');
    });

    it('should include all 8 features', () => {
      const features = FeatureScaffolder.getAvailableFeatures();

      expect(features).toContain('auth');
      expect(features).toContain('payments');
      expect(features).toContain('logging');
      expect(features).toContain('api-docs');
      expect(features).toContain('email');
      expect(features).toContain('cache');
      expect(features).toContain('queue');
      expect(features).toContain('websocket');
    });
  });

  describe('validateOptions', () => {
    it('should validate correct options', () => {
      const options: FeatureOptions = {
        name: 'auth',
        servicePath,
      };

      const result = FeatureScaffolder.validateOptions(options);
      expect(result.valid).toBe(true);
    });

    it('should reject unknown feature', () => {
      const options: FeatureOptions = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: 'unknown' as any,
        servicePath,
      };

      const result = FeatureScaffolder.validateOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Unknown feature'))).toBe(true);
    });

    it('should reject non-existent service path', () => {
      const options: FeatureOptions = {
        name: 'auth',
        servicePath: '/non/existent/path',
      };

      const result = FeatureScaffolder.validateOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('does not exist'))).toBe(true);
    });
  });

  describe('addFeature', () => {
    it('should add auth feature', async () => {
      const options: FeatureOptions = {
        name: 'auth',
        servicePath,
      };

      const result = await FeatureScaffolder.addFeature(options);

      expect(result.success).toBe(true);
      expect(result.filesCreated.length).toBeGreaterThan(0);
    });

    it('should create feature directory', async () => {
      const options: FeatureOptions = {
        name: 'payments',
        servicePath,
      };

      const result = await FeatureScaffolder.addFeature(options);

      expect(result.success).toBe(true);

      const featureDir = path.join(servicePath, 'src', 'features', 'payments');
      expect(FileGenerator.directoryExists(featureDir)).toBe(true);
    });

    it('should create index.ts for feature', async () => {
      const options: FeatureOptions = {
        name: 'logging',
        servicePath,
      };

      const result = await FeatureScaffolder.addFeature(options);

      expect(result.success).toBe(true);

      const indexPath = path.join(servicePath, 'src', 'features', 'logging', 'index.ts');
      expect(FileGenerator.fileExists(indexPath)).toBe(true);
    });

    it('should create README for feature', async () => {
      const options: FeatureOptions = {
        name: 'email',
        servicePath,
      };

      const result = await FeatureScaffolder.addFeature(options);

      expect(result.success).toBe(true);

      const readmePath = path.join(servicePath, 'src', 'features', 'email', 'README.md');
      expect(FileGenerator.fileExists(readmePath)).toBe(true);
    });

    it('should create test file if requested', async () => {
      const options: FeatureOptions = {
        name: 'cache',
        servicePath,
        withTest: true,
      };

      const result = await FeatureScaffolder.addFeature(options);

      expect(result.success).toBe(true);

      const testPath = path.join(servicePath, 'src', 'features', 'cache', 'cache.test.ts');
      expect(FileGenerator.fileExists(testPath)).toBe(true);
    });

    it('should reject duplicate feature', async () => {
      const options: FeatureOptions = {
        name: 'queue',
        servicePath,
      };

      // Add first time
      const result1 = await FeatureScaffolder.addFeature(options);
      expect(result1.success).toBe(true);

      // Try to add again
      const result2 = await FeatureScaffolder.addFeature(options);
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('already exists');
    });

    it('should add all feature types', async () => {
      const features = FeatureScaffolder.getAvailableFeatures();

      for (const feature of features) {
        const options: FeatureOptions = {
          name: feature,
          servicePath: path.join(testDir, `service-${feature}`),
        };

        // Create service dir for each feature
        fs.mkdirSync(path.join(options.servicePath, 'src', 'features'), { recursive: true });

        const result = await FeatureScaffolder.addFeature(options);
        expect(result.success).toBe(true);
      }
    });

    it('should include feature content in generated file', async () => {
      const options: FeatureOptions = {
        name: 'auth',
        servicePath,
      };

      const result = await FeatureScaffolder.addFeature(options);

      expect(result.success).toBe(true);

      const indexPath = path.join(servicePath, 'src', 'features', 'auth', 'index.ts');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('AuthService');
      expect(content).toContain('generateToken');
      expect(content).toContain('verifyToken');
    });
  });

  describe('Feature Templates', () => {
    it('should generate auth feature with token methods', async () => {
      const options: FeatureOptions = { name: 'auth', servicePath };
      await FeatureScaffolder.addFeature(options);

      const indexPath = path.join(servicePath, 'src', 'features', 'auth', 'index.ts');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('generateToken');
      expect(content).toContain('verifyToken');
      expect(content).toContain('decodeToken');
    });

    it('should generate payments feature with transaction methods', async () => {
      const options: FeatureOptions = { name: 'payments', servicePath };
      await FeatureScaffolder.addFeature(options);

      const indexPath = path.join(servicePath, 'src', 'features', 'payments', 'index.ts');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('processPayment');
      expect(content).toContain('refundPayment');
      expect(content).toContain('getStatus');
    });

    it('should generate logging feature with log methods', async () => {
      const options: FeatureOptions = { name: 'logging', servicePath };
      await FeatureScaffolder.addFeature(options);

      const indexPath = path.join(servicePath, 'src', 'features', 'logging', 'index.ts');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('LoggingService');
      expect(content).toContain('getLogs');
      expect(content).toContain('clear');
    });

    it('should generate api-docs feature', async () => {
      const options: FeatureOptions = { name: 'api-docs', servicePath };
      await FeatureScaffolder.addFeature(options);

      const indexPath = path.join(servicePath, 'src', 'features', 'api-docs', 'index.ts');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('ApiDocService');
      expect(content).toContain('generateOpenApiSpec');
    });
  });
});
