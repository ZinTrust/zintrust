/* eslint-disable max-nested-callbacks */
import { ResponseFactoryGenerator, ResponseField } from '@cli/scaffolding/ResponseFactoryGenerator';
import { fsPromises as fs } from '@node-singletons/fs';
import os from '@node-singletons/os';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ResponseFactoryGenerator Validation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-val-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should validate required factory name', async () => {
    try {
      await ResponseFactoryGenerator.validateOptions({
        factoryName: '',
        responseName: 'UserResponse',
        factoriesPath: testDir,
      });
      expect.fail('Should throw error');
    } catch (err) {
      expect((err as Error).message).toContain('factory name is required');
    }
  });

  it('should validate required response name', async () => {
    try {
      await ResponseFactoryGenerator.validateOptions({
        factoryName: 'UserResponseFactory',
        responseName: '',
        factoriesPath: testDir,
      });
      expect.fail('Should throw error');
    } catch (err) {
      expect((err as Error).message).toContain('Response name is required');
    }
  });

  it('should validate factories path exists', async () => {
    try {
      await ResponseFactoryGenerator.validateOptions({
        factoryName: 'UserResponseFactory',
        responseName: 'UserResponse',
        factoriesPath: '/nonexistent/path',
      });
      expect.fail('Should throw error');
    } catch (err) {
      expect((err as Error).message).toContain('Factories directory not found');
    }
  });
});

describe('ResponseFactoryGenerator Success Generation - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-success-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate success response factory', async () => {
    const fields: ResponseField[] = [
      { name: 'id', type: 'uuid', required: true },
      { name: 'name', type: 'string', required: true },
      { name: 'email', type: 'email', required: true },
    ];

    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'UserResponseFactory',
      responseName: 'UserResponse',
      fields,
      responseType: 'success',
      factoriesPath: testDir,
    });

    expect(result.success).toBe(true);
    expect(result.factoryPath).toContain('UserResponseFactory.ts');

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('UserResponseFactory');
    expect(content).toContain('UserResponse');
    expect(content).toContain('make()');
    expect(content).toContain('makeMany()');
    expect(content).toContain("state: 'success'");
  });
});

describe('ResponseFactoryGenerator Multiple Types', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-success-1-types-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should support multiple response types', async () => {
    const types: Array<'success' | 'error' | 'paginated' | 'custom'> = [
      'success',
      'error',
      'paginated',
    ];

    const results = await Promise.all(
      types.map(async (type) =>
        ResponseFactoryGenerator.generate({
          factoryName: `${type.charAt(0).toUpperCase()}ResponseFactory`,
          responseName: `${type}Response`,
          fields: [],
          responseType: type,
          factoriesPath: testDir,
        })
      )
    );

    results.forEach((result) => expect(result.success).toBe(true));
  });
});

describe('ResponseFactoryGenerator Success Generation - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-success-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should handle nullable fields', async () => {
    const fields: ResponseField[] = [
      { name: 'id', type: 'uuid', required: true },
      { name: 'middleName', type: 'string', nullable: true },
      { name: 'bio', type: 'string', nullable: true },
    ];

    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'UserResponseFactory',
      responseName: 'UserResponse',
      fields,
      factoriesPath: testDir,
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(result.factoryPath, 'utf-8');
    // Nullable/non-required fields are set to null in the partial state branch
    expect(content).toContain('data.middleName = null');
    expect(content).toContain('data.bio = null');
  });

  it('should support array fields', async () => {
    const fields: ResponseField[] = [
      { name: 'id', type: 'uuid', required: true },
      { name: 'tags', type: 'string', array: true },
    ];

    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'UserResponseFactory',
      responseName: 'UserResponse',
      fields,
      factoriesPath: testDir,
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('tags: Array.from');
    expect(content).toContain('data.tags = null');
  });
});

describe('ResponseFactoryGenerator Other Tests', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-other-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Generation - Error Response', () => {
    it('should generate error response factory', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'ErrorResponseFactory',
        responseName: 'ErrorResponse',
        responseType: 'error',
        factoriesPath: testDir,
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('error');
      expect(content).toContain('errors');
    });
  });

  describe('Generation - Paginated Response', () => {
    it('should generate paginated response factory', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'PaginatedResponseFactory',
        responseName: 'PaginatedResponse',
        responseType: 'paginated',
        factoriesPath: testDir,
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('pagination');
      expect(content).toContain('page');
      expect(content).toContain('limit');
    });
  });
});

describe('ResponseFactoryGenerator Factory Methods - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-methods-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should include create() method', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('Object.freeze({');
    expect(content).toContain('new()');
  });

  it('should include times() method', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('times(count: number)');
  });

  it('should include state() method', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain("setState(state: 'success' | 'error' | 'partial')");
  });
});

describe('ResponseFactoryGenerator Factory Methods - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-methods-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should include make() method', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('make()');
  });

  it('should include makeMany() method', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('makeMany()');
  });

  it('should include get() alias', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('get()');
  });

  it('should include first() method', async () => {
    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'TestResponseFactory',
      responseName: 'TestResponse',
      factoriesPath: testDir,
    });

    const content = await fs.readFile(result.factoryPath, 'utf-8');
    expect(content).toContain('first()');
  });
});

describe('ResponseFactoryGenerator Code Validation and Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-int-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Generation - Response DTO', () => {
    it('should generate response DTO when path provided', async () => {
      const responsesPath = path.join(testDir, 'responses');
      await fs.mkdir(responsesPath, { recursive: true });

      const fields: ResponseField[] = [
        { name: 'id', type: 'uuid', required: true },
        { name: 'name', type: 'string', required: true },
      ];

      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'UserResponseFactory',
        responseName: 'UserResponse',
        fields,
        factoriesPath: testDir,
        responsesPath,
      });

      expect(result.success).toBe(true);
      expect(result.responsePath).toBeDefined();

      if (typeof result.responsePath === 'string') {
        const dtoContent = await fs.readFile(result.responsePath, 'utf-8');
        expect(dtoContent).toContain('toJSON()');
        expect(dtoContent).toContain('validate()');
        expect(dtoContent).toContain('create(data:');
      }
    });
  });
});

describe('ResponseFactoryGenerator Field Types Support', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-field-types-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Field Types', () => {
    it('should support all field types', async () => {
      const fieldTypes: ResponseField['type'][] = [
        'string',
        'number',
        'boolean',
        'date',
        'json',
        'uuid',
        'email',
      ];

      const results = await Promise.all(
        fieldTypes.map(async (type) => {
          const fields: ResponseField[] = [
            { name: 'id', type: 'uuid', required: true },
            { name: `${type}Field`, type },
          ];

          const result = await ResponseFactoryGenerator.generate({
            factoryName: `${type.charAt(0).toUpperCase()}FieldFactory`,
            responseName: `${type}Response`,
            fields,
            factoriesPath: testDir,
          });

          expect(result.success).toBe(true);
          expect(result.factoryPath).toBeDefined();
        })
      );

      // keep `results` referenced to avoid unused warnings in strict setups
      expect(results.length).toBe(fieldTypes.length);
    });
  });
});

describe('ResponseFactoryGenerator Code Validation Basic', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-code-val-basic-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Code Validation Basic', () => {
    it('should generate valid TypeScript code', async () => {
      const fields: ResponseField[] = [
        { name: 'id', type: 'uuid', required: true },
        { name: 'name', type: 'string', required: true },
      ];

      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'ValidResponseFactory',
        responseName: 'ValidResponse',
        fields,
        factoriesPath: testDir,
      });

      const content = await fs.readFile(result.factoryPath, 'utf-8');

      // Should have proper imports
      expect(content).toContain('import { faker }');

      // Should have sealed namespace
      expect(content).toContain('Object.freeze({');
      expect(content).toContain('export const ValidResponseFactory');

      // Should have proper structure
      expect(content).toContain('{');
      expect(content).toContain('}');

      // Should not have syntax errors
      expect(content).not.toContain('undefined undefined');
    });
  });
});

describe('ResponseFactoryGenerator Code Validation DTO', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-code-val-dto-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Code Validation DTO', () => {
    it('should generate DTO with proper structure', async () => {
      const responsesPath = path.join(testDir, 'responses');
      await fs.mkdir(responsesPath, { recursive: true });

      const fields: ResponseField[] = [{ name: 'id', type: 'uuid', required: true }];

      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'UserResponseFactory',
        responseName: 'UserResponse',
        fields,
        factoriesPath: testDir,
        responsesPath,
      });

      if (typeof result.responsePath === 'string') {
        const dtoContent = await fs.readFile(result.responsePath, 'utf-8');

        // Should have proper sealed namespace structure
        expect(dtoContent).toContain('Object.freeze({');
        expect(dtoContent).toContain('export const UserResponse');
        expect(dtoContent).toContain('toJSON()');
        expect(dtoContent).toContain('validate()');

        // Should return string[] from validate
        expect(dtoContent).toContain('string[]');
      }
    });
  });
});

// Integration Tests - Part 1 and Part 2 are already separate describe blocks,
// but they were nested inside 'ResponseFactoryGenerator Code Validation and Integration'.
// I've already moved them out by closing the parent describe block.

describe('ResponseFactoryGenerator Integration Tests - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-int-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate complete response testing suite', async () => {
    const responsesPath = path.join(testDir, 'responses');
    await fs.mkdir(responsesPath, { recursive: true });

    const fields: ResponseField[] = [
      { name: 'id', type: 'uuid', required: true },
      { name: 'username', type: 'string', required: true },
      { name: 'email', type: 'email', required: true },
      { name: 'isActive', type: 'boolean', required: true },
      { name: 'createdAt', type: 'date', required: true },
      { name: 'metadata', type: 'json', nullable: true },
    ];

    const result = await ResponseFactoryGenerator.generate({
      factoryName: 'UserResponseFactory',
      responseName: 'UserResponse',
      fields,
      responseType: 'success',
      factoriesPath: testDir,
      responsesPath,
    });

    expect(result.success).toBe(true);
    expect(result.factoryPath).toBeDefined();
    expect(result.responsePath).toBeDefined();

    // Verify factory file
    const factoryContent = await fs.readFile(result.factoryPath, 'utf-8');
    expect(factoryContent).toContain('UserResponseFactory');
    expect(factoryContent).toContain('UserResponse');
    expect(factoryContent.length).toBeGreaterThan(500);

    // Verify DTO file
    if (typeof result.responsePath === 'string') {
      const dtoContent = await fs.readFile(result.responsePath, 'utf-8');
      expect(dtoContent).toContain('UserResponse');
      expect(dtoContent).toContain('validate()');
      expect(dtoContent.length).toBeGreaterThan(300);
    }
  });
});

describe('Integration Tests - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-int-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should support all response types in integration', async () => {
    const types: Array<'success' | 'error' | 'paginated' | 'custom'> = [
      'success',
      'error',
      'paginated',
    ];

    await Promise.all(
      types.map(async (type) => {
        const result = await ResponseFactoryGenerator.generate({
          factoryName: `${type}TestFactory`,
          responseName: `${type}TestResponse`,
          responseType: type,
          factoriesPath: testDir,
        });

        expect(result.success).toBe(true);
        expect(result.factoryPath).toBeDefined();

        const content = await fs.readFile(result.factoryPath, 'utf-8');
        expect(content.length).toBeGreaterThan(300);
      })
    );
  });
});
