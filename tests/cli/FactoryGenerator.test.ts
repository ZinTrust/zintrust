/**
 * Factory Generator Tests
 * Tests for factory generation functionality
 */

import { FactoryField, FactoryGenerator, FactoryOptions } from '@cli/scaffolding/FactoryGenerator';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('FactoryGenerator Validation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should throw error when factory name is missing', async () => {
    const options: Partial<FactoryOptions> = {
      factoryName: '',
      modelName: 'User',
      factoriesPath: testDir,
    };

    await expect(FactoryGenerator.validateOptions(options as FactoryOptions)).rejects.toThrow(
      'Factory name is required'
    );
  });

  it('should throw error when model name is missing', async () => {
    const options: Partial<FactoryOptions> = {
      factoryName: 'UserFactory',
      modelName: '',
      factoriesPath: testDir,
    };

    await expect(FactoryGenerator.validateOptions(options as FactoryOptions)).rejects.toThrow(
      'Model name is required'
    );
  });

  it('should throw error when factory name does not end with Factory', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserGenerator',
      modelName: 'User',
      factoriesPath: testDir,
    };

    await expect(FactoryGenerator.validateOptions(options)).rejects.toThrow(
      "must end with 'Factory'"
    );
  });
});

describe('FactoryGenerator Path Validation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should throw error when path does not exist', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: path.join(testDir, 'nonexistent'),
    };

    await expect(FactoryGenerator.validateOptions(options)).rejects.toThrow(
      'Factories path does not exist'
    );
  });

  it('should pass validation with valid options', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    await expect(FactoryGenerator.validateOptions(options)).resolves.not.toThrow();
  });
});

describe('FactoryGenerator Basic Generation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should create a basic factory file', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(result.factoryName).toBe('UserFactory');

    const fileExists = await fs.stat(result.filePath ?? '').catch(() => null);
    expect(fileExists).toBeTruthy();
  });
});

describe('FactoryGenerator Class Structure', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should generate factory with correct class name', async () => {
    const options: FactoryOptions = {
      factoryName: 'PostFactory',
      modelName: 'Post',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('Object.freeze({');
    expect(content).toContain('export const PostFactory');
  });

  it('should include Faker import', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('import { faker }');
  });

  it('should include model import', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('import { User }');
  });
});

describe('FactoryGenerator State Patterns', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should include state patterns', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('getActiveState');
    expect(content).toContain('getInactiveState');
    expect(content).toContain('getDeletedState');
  });
});

describe('FactoryGenerator Methods', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should include make method', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('make = () => ({');
  });

  it('should include count method', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('count(n: number) {');
  });

  it('should include state method', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('state(name: string)');
  });
});

describe('FactoryGenerator Advanced Generation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should support custom fields', async () => {
    const fields: FactoryField[] = [
      { name: 'id', type: 'integer' },
      { name: 'username', type: 'string' },
      { name: 'is_admin', type: 'boolean' },
    ];

    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('username:');
    expect(content).toContain('is_admin:');
  });

  it('should support relationships', async () => {
    const options: FactoryOptions = {
      factoryName: 'PostFactory',
      modelName: 'Post',
      factoriesPath: testDir,
      relationships: ['User', 'Category'],
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('withUser');
    expect(content).toContain('withCategory');
  });
});

describe('FactoryGenerator Default Models', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should include create method', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('create() {');
  });

  it('should handle User factory defaults', async () => {
    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('name:');
    expect(content).toContain('email:');
    expect(content).toContain('password:');
  });
});

describe('FactoryGenerator Model Variations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should handle Post factory defaults', async () => {
    const options: FactoryOptions = {
      factoryName: 'PostFactory',
      modelName: 'Post',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('title:');
    expect(content).toContain('content:');
    expect(content).toContain('user_id:');
  });

  it('should handle Product factory defaults', async () => {
    const options: FactoryOptions = {
      factoryName: 'ProductFactory',
      modelName: 'Product',
      factoriesPath: testDir,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('price:');
    expect(content).toContain('stock:');
    expect(content).toContain('active:');
  });
});

describe('FactoryGenerator Smart Detection Basic', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should smart-detect email fields', async () => {
    const fields: FactoryField[] = [
      { name: 'id', type: 'integer' },
      { name: 'email_address', type: 'string' },
    ];

    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('faker.internet.email()');
  });

  it('should smart-detect phone fields', async () => {
    const fields: FactoryField[] = [
      { name: 'id', type: 'integer' },
      { name: 'phone_number', type: 'string' },
    ];

    const options: FactoryOptions = {
      factoryName: 'ContactFactory',
      modelName: 'Contact',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('faker.phone.number()');
  });
});

describe('FactoryGenerator Smart Detection Advanced', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should smart-detect name fields', async () => {
    const fields: FactoryField[] = [
      { name: 'id', type: 'integer' },
      { name: 'full_name', type: 'string' },
    ];

    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('faker.person.fullName()');
  });
});

describe('FactoryGenerator Advanced Fields', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should support nullable fields', async () => {
    const fields: FactoryField[] = [
      { name: 'id', type: 'integer' },
      { name: 'deleted_at', type: 'datetime', nullable: true },
    ];

    const options: FactoryOptions = {
      factoryName: 'UserFactory',
      modelName: 'User',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);

    const content = await fs.readFile(result.filePath ?? '', 'utf-8');
    expect(content).toContain('deleted_at:');
  });

  it('should generate multiple factories', async () => {
    const factories = [
      { name: 'UserFactory', model: 'User' },
      { name: 'PostFactory', model: 'Post' },
      { name: 'ProductFactory', model: 'Product' },
    ];

    for (const factory of factories) {
      const result = await FactoryGenerator.generateFactory({
        factoryName: factory.name,
        modelName: factory.model,
        factoriesPath: testDir,
      });

      expect(result.success).toBe(true);
    }

    const files = await fs.readdir(testDir);
    expect(files.length).toBe(3);
    expect(files).toContain('UserFactory.ts');
    expect(files).toContain('PostFactory.ts');
    expect(files).toContain('ProductFactory.ts');
  });
});

describe('FactoryGenerator Field Type Support', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should support string type', async () => {
    const fields: FactoryField[] = [{ name: 'slug', type: 'string' }];
    const options: FactoryOptions = {
      factoryName: 'PageFactory',
      modelName: 'Page',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);
    const content = await fs.readFile(result.filePath ?? '', 'utf-8');

    expect(content).toContain('slug:');
  });

  it('should support integer type', async () => {
    const fields: FactoryField[] = [{ name: 'count', type: 'integer' }];
    const options: FactoryOptions = {
      factoryName: 'StatsFactory',
      modelName: 'Stats',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);
    const content = await fs.readFile(result.filePath ?? '', 'utf-8');

    expect(content).toContain('faker.number.int');
  });

  it('should support float type', async () => {
    const fields: FactoryField[] = [{ name: 'rating', type: 'float' }];
    const options: FactoryOptions = {
      factoryName: 'ReviewFactory',
      modelName: 'Review',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);
    const content = await fs.readFile(result.filePath ?? '', 'utf-8');

    expect(content).toContain('faker.number.float');
  });
});

describe('FactoryGenerator Complex Types', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should support boolean type', async () => {
    const fields: FactoryField[] = [{ name: 'published', type: 'boolean' }];
    const options: FactoryOptions = {
      factoryName: 'ArticleFactory',
      modelName: 'Article',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);
    const content = await fs.readFile(result.filePath ?? '', 'utf-8');

    expect(content).toContain('faker.datatype.boolean()');
  });

  it('should support datetime type', async () => {
    const fields: FactoryField[] = [{ name: 'published_at', type: 'datetime' }];
    const options: FactoryOptions = {
      factoryName: 'ArticleFactory',
      modelName: 'Article',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);
    const content = await fs.readFile(result.filePath ?? '', 'utf-8');

    expect(content).toContain('faker.date.past()');
  });

  it('should support json type', async () => {
    const fields: FactoryField[] = [{ name: 'metadata', type: 'json' }];
    const options: FactoryOptions = {
      factoryName: 'ConfigFactory',
      modelName: 'Config',
      factoriesPath: testDir,
      fields,
    };

    const result = await FactoryGenerator.generateFactory(options);
    const content = await fs.readFile(result.filePath ?? '', 'utf-8');

    expect(content).toContain('{ key:');
    expect(content).toContain('metadata: { key: "value" }');
  });
});

describe('FactoryGenerator Metadata', () => {
  it('should return list of supported types', () => {
    const types = FactoryGenerator.getAvailableTypes();

    expect(types).toContain('string');
    expect(types).toContain('integer');
    expect(types).toContain('float');
    expect(types).toContain('boolean');
    expect(types).toContain('datetime');
    expect(types).toContain('json');
    expect(types).toContain('email');
    expect(types).toContain('phone');
  });
});
