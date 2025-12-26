/**
 * Request Factory Generator Tests - Phase 6.3
 * Comprehensive tests for request DTO factory generation
 */

import {
  RequestFactoryGenerator,
  RequestFactoryOptions,
  /* eslint-disable max-nested-callbacks */
  RequestField,
} from '@cli/scaffolding/RequestFactoryGenerator';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RequestFactoryGenerator Validation Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-validation-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('validateOptions - Error Cases Part 1', () => {
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
  });
});

describe('RequestFactoryGenerator Validation Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-validation-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('validateOptions - Error Cases Part 2', () => {
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
  });
});

describe('RequestFactoryGenerator Validation Success', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-validation-success-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('validateOptions - Success Cases', () => {
    it('should validate correct options', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      await expect(RequestFactoryGenerator.validateOptions(options)).resolves.toBeUndefined();
    });
  });
});

describe('RequestFactoryGenerator Basic Generation - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-basic-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateRequestFactory - Core', () => {
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
      expect(fileContent).toContain('Object.freeze({');
      expect(fileContent).toContain('export const CreateUserRequestFactory');
      expect(fileContent).toContain('export const CreateUserRequest');
    });

    it('should generate factory with create method', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'LoginRequestFactory',
        requestName: 'LoginRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('new()');
      expect(fileContent).toContain('make(overrides');
      expect(fileContent).toContain('return LoginRequest.create(data)');
    });

    it('should generate factory with times method for multiple instances', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'PostRequestFactory',
        requestName: 'PostRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('count(n: number)');
      expect(fileContent).toContain('get()');
      expect(fileContent).toContain('Array.from({ length: recordCount }');
    });
  });
});

describe('RequestFactoryGenerator Basic Generation - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-basic-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateRequestFactory - Features', () => {
    it('should include state management', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'UpdateUserRequestFactory',
        requestName: 'UpdateUserRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('state(name: string)');
      expect(fileContent).toContain('const states = new Set<string>()');
      expect(fileContent).toContain("states.has('invalid')");
      expect(fileContent).toContain("states.has('empty')");
      expect(fileContent).toContain("states.has('minimal')");
    });

    it('should include validation methods', async () => {
      const options: RequestFactoryOptions = {
        factoryName: 'CreateUserRequestFactory',
        requestName: 'CreateUserRequest',
        factoriesPath: testDir,
      };

      const result = await RequestFactoryGenerator.generateRequestFactory(options);
      const fileContent = await fs.readFile(result.factoryPath, 'utf-8');

      expect(fileContent).toContain('validate()');
      expect(fileContent).toContain('const errors: Record<string, string>');
      expect(fileContent).toContain('valid:');
      expect(fileContent).toContain('toJSON()');
    });
  });
});

describe('RequestFactoryGenerator Advanced Generation - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-advanced-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateRequestFactory - Custom Fields', () => {
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
  });
});

describe('RequestFactoryGenerator Advanced Generation - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-advanced-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateRequestFactory - DTO Generation', () => {
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

      if (result.requestPath !== null && result.requestPath !== undefined) {
        const fileContent = await fs.readFile(result.requestPath, 'utf-8');
        expect(fileContent).toContain('Object.freeze({');
        expect(fileContent).toContain('export const CreateUserRequest');
        expect(fileContent).toContain('validate()');
      }
    });
  });
});

describe('RequestFactoryGenerator Specialized Generation - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-specialized-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateRequestFactory - Metadata', () => {
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

      if (result.requestPath !== null && result.requestPath !== undefined) {
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
  });
});

describe('RequestFactoryGenerator Specialized Generation - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-specialized-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('generateRequestFactory - Multiple Factories', () => {
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

      await RequestFactoryGenerator.generateRequestFactory(options1);
      await RequestFactoryGenerator.generateRequestFactory(options2);

      const files = await fs.readdir(testDir);
      expect(files).toContain('CreateUserRequestFactory.ts');
      expect(files).toContain('UpdateUserRequestFactory.ts');
    });
  });
});

describe('RequestFactoryGenerator Code Validation', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-code-validation-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
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
      expect(fileContent).toMatch(/export const/);
      expect(fileContent).toContain('Object.freeze({');
      expect(fileContent).toContain("import { faker } from '@faker-js/faker'");
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
});

describe('RequestFactoryGenerator Integration Tests - Part 1', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-integration-1-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Integration Tests - Common Types', () => {
    it('should generate common request types (create, update, login, register)', async () => {
      const requestTypes = [
        { factory: 'CreateUserRequestFactory', request: 'CreateUserRequest' },
        { factory: 'UpdateUserRequestFactory', request: 'UpdateUserRequest' },
        { factory: 'LoginRequestFactory', request: 'LoginRequest' },
        { factory: 'RegisterRequestFactory', request: 'RegisterRequest' },
      ];

      await Promise.all(
        requestTypes.map(async (type) => {
          const options: RequestFactoryOptions = {
            factoryName: type.factory,
            requestName: type.request,
            factoriesPath: testDir,
          };

          const result = await RequestFactoryGenerator.generateRequestFactory(options);
          expect(result.success).toBe(true);

          const fileContent = await fs.readFile(result.factoryPath, 'utf-8');
          expect(fileContent).toContain('Object.freeze({');
          expect(fileContent).toContain(`export const ${type.factory}`);
          expect(fileContent).toContain(`export const ${type.request}`);
        })
      );
    });
  });
});

describe('RequestFactoryGenerator Integration Tests - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-integration-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Integration Tests - Complex Fields', () => {
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
  });
});

describe('RequestFactoryGenerator Integration Tests - Part 2', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-integration-2-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Integration Tests - Patterns', () => {
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
      expect(fileContent).toContain("states.has('invalid')");
      expect(fileContent).toContain("states.has('empty')");
      expect(fileContent).toContain("states.has('minimal')");
    });

    it('should provide available options list', () => {
      const options = RequestFactoryGenerator.getAvailableOptions();

      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toContain('generation');
    });
  });
});

describe('RequestFactoryGenerator Error Handling', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-request-factories-errors-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (await fs.stat(testDir).catch(() => null)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
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
