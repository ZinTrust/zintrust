/**
 * Seeder Generator Tests - Phase 6.2
 * Comprehensive tests for database seeder generation
 */

import { SeederGenerator, SeederOptions } from '@cli/scaffolding/SeederGenerator';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SeederGenerator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('validateOptions', () => {
    it('should throw error when seeder name is missing', async () => {
      const options: Partial<SeederOptions> = {
        seederName: '',
        modelName: 'User',
        seedersPath: testDir,
      };

      await expect(SeederGenerator.validateOptions(options as SeederOptions)).rejects.toThrow(
        'Seeder name is required'
      );
    });

    it('should throw error when seeder name does not end with "Seeder"', async () => {
      const options: Partial<SeederOptions> = {
        seederName: 'User',
        modelName: 'User',
        seedersPath: testDir,
      };

      await expect(SeederGenerator.validateOptions(options as SeederOptions)).rejects.toThrow(
        'Seeder name must end with "Seeder"'
      );
    });

    it('should throw error when model name is missing', async () => {
      const options: Partial<SeederOptions> = {
        seederName: 'UserSeeder',
        modelName: '',
        seedersPath: testDir,
      };

      await expect(SeederGenerator.validateOptions(options as SeederOptions)).rejects.toThrow(
        'Model name is required'
      );
    });

    it('should throw error when seeders path does not exist', async () => {
      const options: Partial<SeederOptions> = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: path.join(testDir, 'nonexistent'),
      };

      await expect(SeederGenerator.validateOptions(options as SeederOptions)).rejects.toThrow(
        'Seeders path does not exist'
      );
    });

    it('should throw error when count is invalid', async () => {
      const options: Partial<SeederOptions> = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        count: 0,
      };

      await expect(SeederGenerator.validateOptions(options as SeederOptions)).rejects.toThrow(
        'Count must be between 1 and 100000'
      );
    });

    it('should throw error when count exceeds maximum', async () => {
      const options: Partial<SeederOptions> = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        count: 100001,
      };

      await expect(SeederGenerator.validateOptions(options as SeederOptions)).rejects.toThrow(
        'Count must be between 1 and 100000'
      );
    });

    it('should validate correct options', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        count: 100,
      };

      await expect(SeederGenerator.validateOptions(options)).resolves.toBeUndefined();
    });
  });

  describe('generateSeeder', () => {
    it('should create a basic seeder file', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        count: 50,
      };

      const result = await SeederGenerator.generateSeeder(options);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('UserSeeder.ts');

      const fileContent = await fs.readFile(result.filePath, 'utf-8');
      expect(fileContent).toContain('class UserSeeder');
      expect(fileContent).toContain('async run()');
    });

    it('should generate seeder with correct class name', async () => {
      const options: SeederOptions = {
        seederName: 'PostSeeder',
        modelName: 'Post',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('export class PostSeeder');
    });

    it('should include factory import', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('import { UserFactory }');
      expect(fileContent).toContain("from '@database/factories/UserFactory'");
    });

    it('should include model import', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('import { User }');
      expect(fileContent).toContain("from '@app/Models/User'");
    });

    it('should include run method', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        count: 25,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('async run(): Promise<void>');
      expect(fileContent).toContain('factory.count(25).get()');
    });

    it('should include getRecords method', async () => {
      const options: SeederOptions = {
        seederName: 'PostSeeder',
        modelName: 'Post',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('async getRecords(count: number)');
      expect(fileContent).toContain('factory.count(count).get()');
    });

    it('should include state methods', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('async seedWithStates(): Promise<void>');
      expect(fileContent).toContain("state('active')");
      expect(fileContent).toContain("state('inactive')");
      expect(fileContent).toContain("state('deleted')");
    });

    it('should include reset method', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('async reset(): Promise<void>');
      expect(fileContent).toContain('TRUNCATE TABLE');
    });

    it('should handle custom factory name', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        factoryName: 'CustomUserFactory',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('CustomUserFactory');
    });

    it('should support relationship seeding', async () => {
      const options: SeederOptions = {
        seederName: 'PostSeeder',
        modelName: 'Post',
        seedersPath: testDir,
        relationships: ['User', 'Category'],
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('async seedWithRelationships()');
      expect(fileContent).toContain('User');
      expect(fileContent).toContain('Category');
    });

    it('should handle count parameter', async () => {
      const options: SeederOptions = {
        seederName: 'ProductSeeder',
        modelName: 'Product',
        seedersPath: testDir,
        count: 1000,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('const count = 1000');
      expect(fileContent).toContain('factory.count(1000)');
    });

    it('should handle truncate option', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        truncate: true,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('if (true)');
    });

    it('should handle no truncate option', async () => {
      const options: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        truncate: false,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('if (false)');
    });

    it('should return error for invalid seeder name', async () => {
      const options: Partial<SeederOptions> = {
        seederName: 'InvalidName',
        modelName: 'User',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options as SeederOptions);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Seeder name must end with "Seeder"');
    });

    it('should create multiple seeders in same directory', async () => {
      const options1: SeederOptions = {
        seederName: 'UserSeeder',
        modelName: 'User',
        seedersPath: testDir,
      };

      const options2: SeederOptions = {
        seederName: 'PostSeeder',
        modelName: 'Post',
        seedersPath: testDir,
      };

      const result1 = await SeederGenerator.generateSeeder(options1);
      const result2 = await SeederGenerator.generateSeeder(options2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const files = await fs.readdir(testDir);
      expect(files).toContain('UserSeeder.ts');
      expect(files).toContain('PostSeeder.ts');
    });
  });

  describe('Seeder Content', () => {
    it('should have valid TypeScript syntax', async () => {
      const options: SeederOptions = {
        seederName: 'ArticleSeeder',
        modelName: 'Article',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('export class');
      expect(fileContent).toContain('async');
      expect(fileContent).toContain('Promise<void>');
      expect(fileContent).toContain('Logger.info');
    });

    it('should include comments and documentation', async () => {
      const options: SeederOptions = {
        seederName: 'CommentSeeder',
        modelName: 'Comment',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('/**');
      expect(fileContent).toContain('Seeder for populating');
      expect(fileContent).toContain('Run the seeder');
    });

    it('should generate correct table names from model names', async () => {
      const testCases = [
        { model: 'User', table: 'users' },
        { model: 'Post', table: 'posts' },
        { model: 'UserProfile', table: 'user_profiles' },
        { model: 'BlogPost', table: 'blog_posts' },
      ];

      for (const testCase of testCases) {
        const options: SeederOptions = {
          seederName: `${testCase.model}Seeder`,
          modelName: testCase.model,
          seedersPath: testDir,
        };

        const result = await SeederGenerator.generateSeeder(options);
        const fileContent = await fs.readFile(result.filePath, 'utf-8');

        expect(fileContent).toContain(testCase.table);
      }
    });
  });

  describe('Seeder Options', () => {
    it('should provide list of available options', () => {
      const options = SeederGenerator.getAvailableOptions();

      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
      expect(options).toContain('Truncate table before seeding (default: true)');
      expect(options).toContain('Custom record count (default: 10, max: 100000)');
      expect(options).toContain('Relationship seeding');
      expect(options).toContain('State-based distribution (active, inactive, deleted)');
      expect(options).toContain('Batch operations for large datasets');
    });
  });

  describe('Integration', () => {
    it('should generate seeders for common models', async () => {
      const models = ['User', 'Post', 'Product', 'Order', 'Comment'];

      for (const model of models) {
        const options: SeederOptions = {
          seederName: `${model}Seeder`,
          modelName: model,
          seedersPath: testDir,
          count: 50,
        };

        const result = await SeederGenerator.generateSeeder(options);
        expect(result.success).toBe(true);

        const fileContent = await fs.readFile(result.filePath, 'utf-8');
        expect(fileContent).toContain(`export class ${model}Seeder`);
        expect(fileContent).toContain(`import { ${model} }`);
      }
    });

    it('should support complex relationships', async () => {
      const options: SeederOptions = {
        seederName: 'OrderSeeder',
        modelName: 'Order',
        seedersPath: testDir,
        relationships: ['User', 'Product', 'Payment', 'Shipping'],
        count: 100,
      };

      const result = await SeederGenerator.generateSeeder(options);
      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(result.filePath, 'utf-8');
      expect(fileContent).toContain('seedWithRelationships');
      expect(fileContent).toContain('User');
      expect(fileContent).toContain('Product');
      expect(fileContent).toContain('Payment');
      expect(fileContent).toContain('Shipping');
    });

    it('should handle large dataset seeding', async () => {
      const options: SeederOptions = {
        seederName: 'BulkUserSeeder',
        modelName: 'User',
        seedersPath: testDir,
        count: 10000,
      };

      const result = await SeederGenerator.generateSeeder(options);
      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(result.filePath, 'utf-8');
      expect(fileContent).toContain('10000');
      expect(fileContent).toContain('factory.count(10000)');
    });

    it('should support state distribution', async () => {
      const options: SeederOptions = {
        seederName: 'DistributedSeeder',
        modelName: 'Article',
        seedersPath: testDir,
        count: 100,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('Math.ceil(100 * 0.5)'); // 50% active
      expect(fileContent).toContain('Math.ceil(100 * 0.3)'); // 30% inactive
      expect(fileContent).toContain('Math.ceil(100 * 0.2)'); // 20% deleted
    });
  });
});
