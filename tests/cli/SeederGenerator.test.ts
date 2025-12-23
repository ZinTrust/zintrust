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

describe('SeederGenerator Validation Basic', () => {
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

  describe('validateOptions Basic', () => {
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
  });
});

describe('SeederGenerator Validation Advanced', () => {
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

  describe('validateOptions Advanced', () => {
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
  });
});

describe('SeederGenerator Generation Basic - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-basic-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateSeeder Basic - Core', () => {
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
      expect(fileContent).toContain('Object.freeze({');
      expect(fileContent).toContain('export const UserSeeder');
      expect(fileContent).toContain('async run(): Promise<void>');
    });

    it('should generate seeder with correct class name', async () => {
      const options: SeederOptions = {
        seederName: 'PostSeeder',
        modelName: 'Post',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('Object.freeze({');
      expect(fileContent).toContain('export const PostSeeder');
    });
  });
});

describe('SeederGenerator Generation Basic - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-basic-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateSeeder Basic - Imports', () => {
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
  });
});

describe('SeederGenerator Generation Methods - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-methods-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateSeeder Methods - Core', () => {
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
      expect(fileContent).toContain('const records = factory.count(count)');
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
      expect(fileContent).toContain('return factory.count(count)');
    });
  });
});

describe('SeederGenerator Generation Methods - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-methods-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateSeeder Methods - Advanced', () => {
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
  });
});

describe('SeederGenerator Generation Options - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-options-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateSeeder Options - Factory', () => {
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
  });
});

describe('SeederGenerator Generation Options - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-options-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateSeeder Options - Parameters', () => {
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
  });
});

describe('SeederGenerator Content - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-content-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Seeder Content - Syntax', () => {
    it('should have valid TypeScript syntax', async () => {
      const options: SeederOptions = {
        seederName: 'ArticleSeeder',
        modelName: 'Article',
        seedersPath: testDir,
      };

      const result = await SeederGenerator.generateSeeder(options);
      const fileContent = await fs.readFile(result.filePath, 'utf-8');

      expect(fileContent).toContain('export const ArticleSeeder');
      expect(fileContent).toContain('Object.freeze({');
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
  });
});

describe('SeederGenerator Content - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-content-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Seeder Content - Table Names', () => {
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
});

describe('SeederGenerator Integration - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-integration-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Integration Basic', () => {
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
        expect(fileContent).toContain(`export const ${model}Seeder`);
        expect(fileContent).toContain('Object.freeze({');
        expect(fileContent).toContain(`import { ${model} }`);
      }
    });
  });
});

describe('SeederGenerator Integration - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-integration-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Integration Advanced', () => {
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
  });
});

describe('SeederGenerator Integration - Part 3A', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-integration-3a-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Integration Advanced', () => {
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

describe('SeederGenerator Integration - Part 3B', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-seeders-integration-3b-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Available Options', () => {
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
});
