import { ResponseFactoryGenerator, ResponseField } from '@cli/scaffolding/ResponseFactoryGenerator';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ResponseFactoryGenerator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), 'response-factory-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Validation', () => {
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
        expect((err as Error).message).toContain('Response class name is required');
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

  describe('Generation - Success Response', () => {
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

    it('should support multiple response types', async () => {
      const types: Array<'success' | 'error' | 'paginated' | 'custom'> = [
        'success',
        'error',
        'paginated',
      ];

      for (const type of types) {
        const result = await ResponseFactoryGenerator.generate({
          factoryName: `${type.charAt(0).toUpperCase()}ResponseFactory`,
          responseName: `${type}Response`,
          fields: [],
          responseType: type,
          factoriesPath: testDir,
        });

        expect(result.success).toBe(true);
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
      expect(content).toContain('| null'); // Nullable fields use type union syntax
    });

    it('should support array fields', async () => {
      const fields: ResponseField[] = [
        { name: 'id', type: 'uuid', required: true },
        { name: 'tags', type: 'string', array: true },
      ];

      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'PostResponseFactory',
        responseName: 'PostResponse',
        fields,
        factoriesPath: testDir,
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('[]');
    });
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
        expect(dtoContent).toContain('constructor');
      }
    });
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

      for (const type of fieldTypes) {
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
      }
    });
  });

  describe('Factory Methods', () => {
    it('should include create() method', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'TestResponseFactory',
        responseName: 'TestResponse',
        factoriesPath: testDir,
      });

      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('static create()');
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

    it('should include make() method', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'TestResponseFactory',
        responseName: 'TestResponse',
        factoriesPath: testDir,
      });

      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('make():');
    });

    it('should include makeMany() method', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'TestResponseFactory',
        responseName: 'TestResponse',
        factoriesPath: testDir,
      });

      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('makeMany():');
    });

    it('should include get() alias', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'TestResponseFactory',
        responseName: 'TestResponse',
        factoriesPath: testDir,
      });

      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('get():');
    });

    it('should include first() method', async () => {
      const result = await ResponseFactoryGenerator.generate({
        factoryName: 'TestResponseFactory',
        responseName: 'TestResponse',
        factoriesPath: testDir,
      });

      const content = await fs.readFile(result.factoryPath, 'utf-8');
      expect(content).toContain('first():');
    });
  });

  describe('Code Validation', () => {
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

      // Should have class declaration
      expect(content).toContain('export class ValidResponseFactory');

      // Should have interface
      expect(content).toContain('export interface ValidResponse');

      // Should have proper structure
      expect(content).toContain('{');
      expect(content).toContain('}');

      // Should not have syntax errors
      expect(content).not.toContain('undefined undefined');
    });

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

        // Should have proper class structure
        expect(dtoContent).toContain('export class UserResponse');
        expect(dtoContent).toContain('constructor');
        expect(dtoContent).toContain('toJSON()');
        expect(dtoContent).toContain('validate()');

        // Should return string[] from validate
        expect(dtoContent).toContain('string[]');
      }
    });
  });

  describe('Integration Tests', () => {
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

    it('should support all response types in integration', async () => {
      const types: Array<'success' | 'error' | 'paginated' | 'custom'> = [
        'success',
        'error',
        'paginated',
      ];

      for (const type of types) {
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
      }
    });
  });
});
