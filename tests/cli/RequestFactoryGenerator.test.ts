/**
 * Request Factory Generator Tests - Phase 6.3
 * Comprehensive tests for request DTO factory generation
 */

import {
  RequestFactoryGenerator,
  RequestFactoryOptions,
  RequestField,
} from '@cli/scaffolding/RequestFactoryGenerator';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RequestFactoryGenerator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('validateOptions', () => {
    it('should throw error when factory name is missing', async () => {
      const options: Partial<RequestFactoryOptions> = {
        factoryName: '',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      await expect(
        RequestFactoryGenerator.validateOptions(options as RequestFactoryOptions)
      ).rejects.toThrow('Request factory name is required');
    });

    it('should throw error when factory name does not end with "RequestFactory"', async () => {
      const options: Partial<RequestFactoryOptions> = {
        factoryName: 'UserFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      await expect(
        RequestFactoryGenerator.validateOptions(options as RequestFactoryOptions)
      ).rejects.toThrow('Request factory name must end with "RequestFactory"');
    });

    it('should throw error when request name is missing', async () => {
      const options: Partial<RequestFactoryOptions> = {
        factoryName: 'CreateUserRequestFactory',
        requestName: '',
        factoriesPath: testDir,
      };

      await expect(
        RequestFactoryGenerator.validateOptions(options as RequestFactoryOptions)
      ).rejects.toThrow('Request name is required');
    });

    it('should throw error when request name does not end with "Request"', async () => {
      const options: Partial<RequestFactoryOptions> = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUser',
        factoriesPath: testDir,
      };

      await expect(
        RequestFactoryGenerator.validateOptions(options as RequestFactoryOptions)
      ).rejects.toThrow('Request name must be PascalCase ending with "Request"');
    });

    it('should validate correct options', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      await expect(RequestFactoryGenerator.validateOptions(options)).resolves.toBeUndefined();
    });
  });

  describe('generateRequestFactory', () => {
    it('should create a basic request factory file', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);

      expect(result.success).toBe(true);
      expect(result.factoryPath).toContain('CreateUserRequestFactory.ts');

      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');
      expect(fileContent).toContain('export class CreateUserRequestFactory');
      expect(fileContent).toContain('export class CreateUserRequest');
    });

    it('should generate factory with create method', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'LoginRequestFactory',
        requestName: 'LoginRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('static create(overrides');
      expect(fileContent).toContain('make(overrides');
    });

    it('should generate factory with times method for multiple instances', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'PostRequestFactory',
        requestName: 'PostRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('static times(count: number)');
      expect(fileContent).toContain('makeMany()');
    });

    it('should include state management', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'UpdateUserRequestFactory',
        requestName: 'UpdateUserRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('state(name: string)');
      expect(fileContent).toContain("this.states.has('invalid')");
      expect(fileContent).toContain("this.states.has('empty')");
      expect(fileContent).toContain("this.states.has('minimal')");
    });

    it('should include validation methods', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain(
        'validate(): { valid: boolean; errors: Record<string, string> }'
      );
      expect(fileContent).toContain('toJSON()');
    });

    it('should handle custom fields', async () => {
      const customFields: RequestField[] = [
        { name: 'username', type: 'string', required: true, min: 3, max: 20 },
        { name: 'email', type: 'email', required: true },
        { name: 'age', type: 'number', required: false, min: 18, max: 120 },
      ];

      const options: RequestFactoryOptions = {
        factoryName: 'RegisterRequestFactory',
        requestName: 'RegisterRequest',
        factoriesPath: testDir,
        fields: customFields,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('username');
      expect(fileContent).toContain('email');
      expect(fileContent).toContain('age');
    });

    it('should support field validation rules', async () => {
      const fields: RequestField[] = [
        { name: 'email', type: 'email', required: true },
        { name: 'password', type: 'string', required: true, min: 8, max: 255 },
      ];

      const options: RequestFactoryOptions = {
        factoryName: 'LoginRequestFactory',
        requestName: 'LoginRequest',
        factoriesPath: testDir,
        fields,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('isValidEmail');
      expect(fileContent).toContain('must be at least 8 characters');
    });

    it('should generate request DTO when requestsPath provided', async () => {
      const requestsPath = path.join(testDir, 'requests');
      await fs.mkdir(requestsPath, { recursive: true });

      const options: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
        requestsPath,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);

      expect(result.success).toBe(true);
      expect(result.requestPath).toBeDefined();

      if (result.requestPath != null) {
        const fileContent = await fs.readFile(result.requestPath, 'utf-8');
        expect(fileContent).toContain('export class CreateUserRequest');
        expect(fileContent).toContain('validate()');
      }
    });

    it('should include endpoint and method in generated DTO', async () => {
      const requestsPath = path.join(testDir, 'requests');
      await fs.mkdir(requestsPath, { recursive: true });

      const options: RequestFactoryOptions = {
        factoryName: 'CreatePostRequestFactory',
        requestName: 'CreatePostRequest',
        endpoint: '/api/posts',
        method: 'POST',
        factoriesPath: testDir,
        requestsPath,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);

      if (result.requestPath != null) {
        const fileContent = await fs.readFile(result.requestPath, 'utf-8');
        expect(fileContent).toContain('POST /api/posts');
      }
    });

    it('should handle invalid factory name error', async () => {
      const options: Partial<RequestFactoryOptions> = {
        factoryName: 'InvalidName',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(
        options as RequestFactoryOptions
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('RequestFactory');
    });

    it('should create multiple factories in same directory', async () => {
      const options1: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      const options2: RequestFactoryOptions = {
        factoryName: 'UpdateUserRequestFactory',
        requestName: 'UpdateUserRequest',
        factoriesPath: testDir,
      };

      const result1 = await RequestFactoryGenerator.generateRequestFactory(options1);
      const result2 = await RequestFactoryGenerator.generateRequestFactory(options2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const files = await fs.readdir(testDir);
      expect(files).toContain('CreateUserRequestFactory.ts');
      expect(files).toContain('UpdateUserRequestFactory.ts');
    });
  });

  describe('Generated Code Validation', () => {
    it('should generate valid TypeScript syntax', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'ArticleRequestFactory',
        requestName: 'ArticleRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      // Check for basic TypeScript patterns
      expect(fileContent).toMatch(/export (class|interface)/);
      expect(fileContent).toMatch(/constructor/);
      expect(fileContent).toMatch(/private|public|static/);
    });

    it('should include proper field type generation', async () => {
      const fields: RequestField[] = [
        { name: 'title', type: 'string' },
        { name: 'count', type: 'number' },
        { name: 'active', type: 'boolean' },
        { name: 'email', type: 'email' },
        { name: 'url', type: 'url' },
        { name: 'id', type: 'uuid' },
      ];

      const options: RequestFactoryOptions = {
        factoryName: 'CompleteRequestFactory',
        requestName: 'CompleteRequest',
        factoriesPath: testDir,
        fields,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('faker.lorem.word()');
      expect(fileContent).toContain('faker.number.int');
      expect(fileContent).toContain('faker.datatype.boolean()');
      expect(fileContent).toContain('faker.internet.email()');
      expect(fileContent).toContain('faker.internet.url()');
      expect(fileContent).toContain('faker.string.uuid()');
    });
  });

  describe('Integration Tests', () => {
    it('should generate common request types (create, update, login, register)', async () => {
      const requestTypes = [
        { factory: 'CreateUserRequestFactory', request: 'CreateUserRequest' },
        { factory: 'UpdateUserRequestFactory', request: 'UpdateUserRequest' },
        { factory: 'LoginRequestFactory', request: 'LoginRequest' },
        { factory: 'RegisterRequestFactory', request: 'RegisterRequest' },
      ];

      for (const type of requestTypes) {
        const options: RequestFactoryOptions = {
          factoryName: type.factory,
          requestName: type.request,
          factoriesPath: testDir,
        };

        const result = await RequestFactoryGenerator.generateRequestFactory(options);
        expect(result.success).toBe(true);

        const fileContent = await fs.readFile(result.factoryPath, 'utf-8');
        expect(fileContent).toContain(`export class ${type.factory}`);
        expect(fileContent).toContain(`export class ${type.request}`);
      }
    });

    it('should support complex multi-field requests', async () => {
      const fields: RequestField[] = [
        { name: 'id', type: 'uuid', required: true, description: 'Resource ID' },
        { name: 'title', type: 'string', required: true, min: 5, max: 200 },
        { name: 'description', type: 'string', required: false, max: 1000 },
        { name: 'tags', type: 'json', required: false },
        { name: 'published', type: 'boolean', required: false },
        { name: 'publishedAt', type: 'date', required: false },
      ];

      const options: RequestFactoryOptions = {
        factoryName: 'PublishArticleRequestFactory',
        requestName: 'PublishArticleRequest',
        factoriesPath: testDir,
        fields,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      expect(result.success).toBe(true);

      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');
      for (const field of fields) {
        expect(fileContent).toContain(field.name);
      }
    });

    it('should generate state patterns for testing', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'ValidationTestRequestFactory',
        requestName: 'ValidationTestRequest',
        factoriesPath: testDir,
        fields: [
          { name: 'email', type: 'email', required: true },
          { name: 'name', type: 'string', required: true },
        ],
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      // Check for state patterns in the code
      expect(fileContent).toContain("this.states.has('invalid')");
      expect(fileContent).toContain("this.states.has('empty')");
      expect(fileContent).toContain("this.states.has('minimal')");
    });

    it('should provide available options list', () => {
      const options = RequestFactoryGenerator.getAvailableOptions();

      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toContain('generation');
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle missing factory name', async () => {
      const options: Partial<RequestFactoryOptions> = {
        requestName: 'TestRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(
        options as RequestFactoryOptions
      );

      expect(result.success).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('should handle non-existent factories path', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'TestRequestFactory',
        requestName: 'TestRequest',
        factoriesPath: '/non/existent/path',
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not exist');
    });
  });
});
