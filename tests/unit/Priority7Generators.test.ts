/**
 * Priority 7 - Microservices Generators Tests
 * Tests for ServiceRequestFactoryGenerator and ServiceIntegrationTestGenerator
 */

import {
  ServiceIntegrationTestGenerator,
  ServiceIntegrationTestOptions,
} from '@cli/scaffolding/ServiceIntegrationTestGenerator';
import {
  ServiceRequestFactoryGenerator,
  ServiceRequestOptions,
} from '@cli/scaffolding/ServiceRequestFactoryGenerator';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ServiceRequestFactoryGenerator Validation Tests - Part 1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-val-1-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should validate correct request factory options', () => {
    const options: ServiceRequestOptions = {
      name: 'CreateUserRequest',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'POST',
      fields: [
        { name: 'email', type: 'email', required: true, description: 'User email' },
        { name: 'name', type: 'string', required: true, description: 'User name' },
      ],
      factoryPath: tempDir,
    };

    const result = ServiceRequestFactoryGenerator.validateOptions(options);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid factory name', () => {
    const options = {
      name: 'InvalidName',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'POST',
      fields: [{ name: 'email', type: 'email', required: true }],
      factoryPath: tempDir,
    } as ServiceRequestOptions;

    const result = ServiceRequestFactoryGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('ServiceRequestFactoryGenerator Validation Tests - Part 2', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-val-2-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should reject invalid service name', () => {
    const options = {
      name: 'CreateUserRequest',
      serviceName: 'InvalidService',
      endpoint: '/api/users',
      method: 'POST',
      fields: [{ name: 'email', type: 'email', required: true }],
      factoryPath: tempDir,
    } as ServiceRequestOptions;

    const result = ServiceRequestFactoryGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid HTTP method', () => {
    const options = {
      name: 'CreateUserRequest',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'INVALID' as unknown as 'GET',
      fields: [{ name: 'email', type: 'email', required: true }],
      factoryPath: tempDir,
    } as ServiceRequestOptions;

    const result = ServiceRequestFactoryGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
  });

  it('should require at least one field', () => {
    const options = {
      name: 'CreateUserRequest',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'POST',
      fields: [],
      factoryPath: tempDir,
    } as ServiceRequestOptions;

    const result = ServiceRequestFactoryGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
  });
});

describe('ServiceRequestFactoryGenerator Generation Tests - Part 1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-1-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should generate service request factory', async () => {
    const options: ServiceRequestOptions = {
      name: 'CreateUserRequest',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'POST',
      fields: [
        { name: 'email', type: 'email', required: true, description: 'User email' },
        { name: 'name', type: 'string', required: true, description: 'User name' },
        { name: 'age', type: 'number', required: false, description: 'User age' },
      ],
      factoryPath: tempDir,
    };

    const result = await ServiceRequestFactoryGenerator.generateRequestFactory(options);

    expect(result.success).toBe(true);
    expect(result.factoryName).toBe('CreateUserRequest');
    expect(fs.existsSync(result.factoryFile)).toBe(true);

    const content = fs.readFileSync(result.factoryFile, 'utf-8');
    expect(content).toContain('CreateUserRequestFactory');
    expect(content).toContain('interface CreateUserRequest');
    expect(content).toContain('email');
    expect(content).toContain('name');
    expect(content).toContain('age');
  });
});

describe('ServiceRequestFactoryGenerator Generation Tests - Part 2', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-2-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should include field types in factory', async () => {
    const options: ServiceRequestOptions = {
      name: 'ListUsersRequest',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'GET',
      fields: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'isActive', type: 'boolean', required: false },
        { name: 'createdAt', type: 'date', required: false },
        { name: 'tags', type: 'array', required: false },
        { name: 'metadata', type: 'object', required: false },
      ],
      factoryPath: tempDir,
    };

    const result = await ServiceRequestFactoryGenerator.generateRequestFactory(options);

    expect(result.success).toBe(true);
    const content = fs.readFileSync(result.factoryFile, 'utf-8');

    // Verify all types are present
    expect(content).toContain('string'); // id, email
    expect(content).toContain('boolean'); // isActive
    expect(content).toContain('Date'); // createdAt
    expect(content).toContain('unknown[]'); // tags
    expect(content).toContain('Record<string, unknown>'); // metadata
  });
});

describe('ServiceRequestFactoryGenerator Generation Tests - Part 3', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-3-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should include state builders', async () => {
    const options: ServiceRequestOptions = {
      name: 'UpdateUserRequest',
      serviceName: 'users',
      endpoint: '/api/users/:id',
      method: 'PUT',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'name', type: 'string', required: true },
      ],
      factoryPath: tempDir,
    };

    const result = await ServiceRequestFactoryGenerator.generateRequestFactory(options);

    expect(result.success).toBe(true);
    const content = fs.readFileSync(result.factoryFile, 'utf-8');

    // Verify state builders exist
    expect(content).toContain('buildValidState');
    expect(content).toContain('buildInvalidState');
    expect(content).toContain('buildMinimalState');
    expect(content).toContain("case 'valid'");
    expect(content).toContain("case 'invalid'");
    expect(content).toContain("case 'minimal'");
  });
});

describe('ServiceRequestFactoryGenerator Generation Tests - Part 4', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-3-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should generate factory with chain methods', async () => {
    const options: ServiceRequestOptions = {
      name: 'DeleteUserRequest',
      serviceName: 'users',
      endpoint: '/api/users/:id',
      method: 'DELETE',
      fields: [{ name: 'id', type: 'uuid', required: true }],
      factoryPath: tempDir,
    };

    const result = await ServiceRequestFactoryGenerator.generateRequestFactory(options);

    const content = fs.readFileSync(result.factoryFile, 'utf-8');

    // Verify chaining methods
    expect(content).toContain('times(count: number)');
    expect(content).toContain('state(state:');
    expect(content).toContain('with(overrides:');
    expect(content).toContain('makeMany()');
    expect(content).toContain('make()');
    expect(content).toContain('first()');
    expect(content).toContain('get()');
  });

  it('should handle validation errors', async () => {
    const options = {
      name: 'InvalidRequest',
      serviceName: 'users',
      endpoint: '/api/users',
      method: 'INVALID',
      fields: [],
      factoryPath: tempDir,
    } as unknown as ServiceRequestOptions;

    const result = await ServiceRequestFactoryGenerator.generateRequestFactory(options);

    expect(result.success).toBe(false);
    expect(result.factoryFile).toBe('');
    expect(result.message).toContain('Validation failed');
  });
});

describe('ServiceIntegrationTestGenerator Validation Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should validate correct integration test options', () => {
    const options: ServiceIntegrationTestOptions = {
      name: 'UserService',
      serviceName: 'users',
      endpoints: [
        { name: 'createUser', method: 'POST', path: '/api/users', description: 'Create user' },
        { name: 'getUser', method: 'GET', path: '/api/users/:id', description: 'Get user' },
      ],
      testPath: tempDir,
    };

    const result = ServiceIntegrationTestGenerator.validateOptions(options);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid service name', () => {
    const options = {
      name: 'InvalidName',
      serviceName: 'users',
      endpoints: [{ name: 'listUsers', method: 'GET', path: '/api/users', description: 'List' }],
      testPath: tempDir,
    } as ServiceIntegrationTestOptions;

    const result = ServiceIntegrationTestGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
  });

  it('should require at least one endpoint', () => {
    const options = {
      name: 'UserService',
      serviceName: 'users',
      endpoints: [],
      testPath: tempDir,
    } as ServiceIntegrationTestOptions;

    const result = ServiceIntegrationTestGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
  });
});

describe('ServiceIntegrationTestGenerator Generation Tests - Part 1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-int-1-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should generate integration test file', async () => {
    const options: ServiceIntegrationTestOptions = {
      name: 'UserService',
      serviceName: 'users',
      endpoints: [
        { name: 'createUser', method: 'POST', path: '/api/users', description: 'Create user' },
        { name: 'getUser', method: 'GET', path: '/api/users/:id', description: 'Get user' },
        { name: 'updateUser', method: 'PUT', path: '/api/users/:id', description: 'Update user' },
      ],
      testPath: tempDir,
      baseUrl: 'http://localhost:3001',
    };

    const result = await ServiceIntegrationTestGenerator.generateIntegrationTest(options);

    expect(result.success).toBe(true);
    expect(fs.existsSync(result.testFile)).toBe(true);

    const content = fs.readFileSync(result.testFile, 'utf-8');
    expect(content).toContain('Integration Tests');
    expect(content).toContain('user'); // camelCase version
    expect(content).toContain('ServiceClient');
  });
});

describe('ServiceIntegrationTestGenerator Generation Tests - Part 2', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-int-2-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should include all endpoints in tests', async () => {
    const options: ServiceIntegrationTestOptions = {
      name: 'OrderService',
      serviceName: 'orders',
      endpoints: [
        { name: 'createOrder', method: 'POST', path: '/api/orders', description: 'Create order' },
        { name: 'getOrder', method: 'GET', path: '/api/orders/:id', description: 'Get order' },
        {
          name: 'updateOrder',
          method: 'PATCH',
          path: '/api/orders/:id',
          description: 'Update order',
        },
        {
          name: 'deleteOrder',
          method: 'DELETE',
          path: '/api/orders/:id',
          description: 'Delete order',
        },
      ],
      testPath: tempDir,
    };

    const result = await ServiceIntegrationTestGenerator.generateIntegrationTest(options);

    const content = fs.readFileSync(result.testFile, 'utf-8');

    // Verify all endpoints are tested
    expect(content).toContain('POST /api/orders');
    expect(content).toContain('GET /api/orders/:id');
    expect(content).toContain('PATCH /api/orders/:id');
    expect(content).toContain('DELETE /api/orders/:id');
  });
});

describe('ServiceIntegrationTestGenerator Generation Tests - Part 4', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-int-4-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should include service client with all HTTP methods', async () => {
    const options: ServiceIntegrationTestOptions = {
      name: 'PaymentService',
      serviceName: 'payments',
      endpoints: [
        {
          name: 'createPayment',
          method: 'POST',
          path: '/api/payments',
          description: 'Create payment',
        },
      ],
      testPath: tempDir,
    };

    const result = await ServiceIntegrationTestGenerator.generateIntegrationTest(options);

    const content = fs.readFileSync(result.testFile, 'utf-8');

    // Verify ServiceClient methods
    expect(content).toContain('async get<T>');
    expect(content).toContain('async post<T>');
    expect(content).toContain('async put<T>');
    expect(content).toContain('async patch<T>');
    expect(content).toContain('async delete<T>');
  });
});

describe('ServiceIntegrationTestGenerator Generation Tests - Part 3', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-gen-int-3-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should include test helpers', async () => {
    const options: ServiceIntegrationTestOptions = {
      name: 'NotificationService',
      serviceName: 'notifications',
      endpoints: [
        {
          name: 'sendNotification',
          method: 'POST',
          path: '/api/notify',
          description: 'Send notification',
        },
      ],
      testPath: tempDir,
    };

    const result = await ServiceIntegrationTestGenerator.generateIntegrationTest(options);

    const content = fs.readFileSync(result.testFile, 'utf-8');

    // Verify test helpers
    expect(content).toContain('createContext');
    expect(content).toContain('createClient');
    expect(content).toContain('verifyHealth');
    expect(content).toContain('waitForService');
  });

  it('should include consumer service reference when provided', async () => {
    const options: ServiceIntegrationTestOptions = {
      name: 'UserService',
      serviceName: 'users',
      consumerService: 'api-gateway',
      endpoints: [
        { name: 'listUsers', method: 'GET', path: '/api/users', description: 'List users' },
      ],
      testPath: tempDir,
    };

    const result = await ServiceIntegrationTestGenerator.generateIntegrationTest(options);

    const content = fs.readFileSync(result.testFile, 'utf-8');
    expect(content).toContain('Consumer Service: api-gateway');
  });
});

describe('Priority 7 - Microservices Integration - Part 1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-int-1-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should generate request factory', async () => {
    const factoryOptions: ServiceRequestOptions = {
      name: 'AuthenticateRequest',
      serviceName: 'auth',
      endpoint: '/api/auth/login',
      method: 'POST',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'password', type: 'string', required: true },
      ],
      factoryPath: tempDir,
    };

    const factoryResult =
      await ServiceRequestFactoryGenerator.generateRequestFactory(factoryOptions);
    expect(factoryResult.success).toBe(true);
    expect(fs.existsSync(factoryResult.factoryFile)).toBe(true);
    const factoryContent = fs.readFileSync(factoryResult.factoryFile, 'utf-8');
    expect(factoryContent).toContain('AuthenticateRequestFactory');
  });
});

describe('Priority 7 - Microservices Integration - Part 2', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-int-2-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should generate integration test', async () => {
    const testOptions: ServiceIntegrationTestOptions = {
      name: 'AuthService',
      serviceName: 'auth',
      consumerService: 'api-gateway',
      endpoints: [
        {
          name: 'login',
          method: 'POST',
          path: '/api/auth/login',
          description: 'Authenticate user',
        },
        { name: 'logout', method: 'POST', path: '/api/auth/logout', description: 'Logout user' },
      ],
      testPath: tempDir,
    };

    const testResult = await ServiceIntegrationTestGenerator.generateIntegrationTest(testOptions);
    expect(testResult.success).toBe(true);
    expect(fs.existsSync(testResult.testFile)).toBe(true);
    const testContent = fs.readFileSync(testResult.testFile, 'utf-8');
    expect(testContent).toContain('Integration Tests');
    expect(testContent).toContain('ServiceClient');
  });
});

describe('Priority 7 - Microservices Integration - Part 3', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `test-int-3-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should generate request factories for multiple HTTP methods', async () => {
    const methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> = [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ];

    for (const method of methods) {
      const options: ServiceRequestOptions = {
        name: `${method}UserRequest`,
        serviceName: 'users',
        endpoint: `/api/users${method === 'GET' ? '/:id' : ''}`,
        method,
        fields: [{ name: 'id', type: 'uuid', required: true }],
        factoryPath: tempDir,
      };

      const result = await ServiceRequestFactoryGenerator.generateRequestFactory(options);
      expect(result.success).toBe(true);
    }

    // Verify all factories were generated
    const files = fs.readdirSync(tempDir);
    expect(files.length).toBeGreaterThanOrEqual(5);
    // Check that factory files contain Request in name
    const factoryFiles = files.filter((f) => f.includes('Request'));
    expect(factoryFiles.length).toBeGreaterThanOrEqual(5);
  });
});
