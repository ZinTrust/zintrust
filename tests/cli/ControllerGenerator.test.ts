/**
 * ControllerGenerator Tests
 * Tests for HTTP controller generation
 */
/* eslint-disable max-nested-callbacks */ import {
  ControllerGenerator,
  type ControllerOptions,
} from '@cli/scaffolding/ControllerGenerator';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ControllerGenerator Validation', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should validate correct controller options', () => {
    const options: ControllerOptions = {
      name: 'UserController',
      controllerPath: testControllersDir,
    };

    const result = ControllerGenerator.validateOptions(options);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid controller names (missing Controller suffix)', () => {
    const options: ControllerOptions = {
      name: 'User',
      controllerPath: testControllersDir,
    };

    const result = ControllerGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/end with 'Controller'/);
  });
});

describe('ControllerGenerator Advanced Validation', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should reject lowercase controller names', () => {
    const options: ControllerOptions = {
      name: 'userController',
      controllerPath: testControllersDir,
    };

    const result = ControllerGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
  });

  it('should reject non-existent controller path', () => {
    const options: ControllerOptions = {
      name: 'UserController',
      controllerPath: '/nonexistent/path',
    };

    const result = ControllerGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not exist/);
  });

  it('should reject invalid controller type', () => {
    const options: ControllerOptions = {
      name: 'UserController',
      controllerPath: testControllersDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: 'invalid' as any,
    };

    const result = ControllerGenerator.validateOptions(options);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid controller type/);
  });
});

describe('ControllerGenerator CRUD and Resource', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate CRUD controller', async () => {
    const options: ControllerOptions = {
      name: 'UserController',
      controllerPath: testControllersDir,
      type: 'crud',
      model: 'User',
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);
    expect(result.controllerName).toBe('UserController');
    expect(result.controllerFile).toContain('UserController.ts');
  });

  it('should generate resource controller', async () => {
    const options: ControllerOptions = {
      name: 'PostController',
      controllerPath: testControllersDir,
      type: 'resource',
      model: 'Post',
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);

    const controllerFile = path.join(testControllersDir, 'PostController.ts');
    const content = await fs.readFile(controllerFile, 'utf-8');

    expect(content).toContain('Object.freeze({');
    expect(content).toContain('export const PostController');
    expect(content).toContain('index(');
    expect(content).toContain('show(');
    expect(content).toContain('store(');
    expect(content).toContain('update(');
    expect(content).toContain('destroy(');
  });
});

describe('ControllerGenerator API and GraphQL', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate API controller', async () => {
    const options: ControllerOptions = {
      name: 'ApiController',
      controllerPath: testControllersDir,
      type: 'api',
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);

    const controllerFile = path.join(testControllersDir, 'ApiController.ts');
    const content = await fs.readFile(controllerFile, 'utf-8');

    expect(content).toContain('handleRequest(');
    expect(content).toContain('handleGet(');
    expect(content).toContain('handlePost(');
  });

  it('should generate GraphQL controller', async () => {
    const options: ControllerOptions = {
      name: 'GraphQLController',
      controllerPath: testControllersDir,
      type: 'graphql',
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);

    const controllerFile = path.join(testControllersDir, 'GraphQLController.ts');
    const content = await fs.readFile(controllerFile, 'utf-8');

    expect(content).toContain('executeQuery(');
    expect(content).toContain('GraphQL');
  });
});

describe('ControllerGenerator WebSocket and Webhook', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate WebSocket controller', async () => {
    const options: ControllerOptions = {
      name: 'WebSocketController',
      controllerPath: testControllersDir,
      type: 'websocket',
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);

    const controllerFile = path.join(testControllersDir, 'WebSocketController.ts');
    const content = await fs.readFile(controllerFile, 'utf-8');

    expect(content).toContain('onConnect(');
    expect(content).toContain('onMessage(');
    expect(content).toContain('onDisconnect(');
  });
});

describe('ControllerGenerator Webhook', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate Webhook controller', async () => {
    const options: ControllerOptions = {
      name: 'WebhookController',
      controllerPath: testControllersDir,
      type: 'webhook',
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);

    const controllerFile = path.join(testControllersDir, 'WebhookController.ts');
    const content = await fs.readFile(controllerFile, 'utf-8');

    expect(content).toContain('verifySignature(');
    expect(content).toContain('processWebhook(');
    expect(content).toContain('x-webhook-signature');
  });

  it('should include error handling in CRUD controller', async () => {
    const options: ControllerOptions = {
      name: 'UserController',
      controllerPath: testControllersDir,
      type: 'crud',
      model: 'User',
      withErrorHandling: true,
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);

    const controllerFile = path.join(testControllersDir, 'UserController.ts');
    const content = await fs.readFile(controllerFile, 'utf-8');

    expect(content).toContain('handleError(');
  });
});

describe('ControllerGenerator Metadata', () => {
  it('should list all available controller types', () => {
    const types = ControllerGenerator.getAvailableTypes();
    expect(types).toContain('crud');
    expect(types).toContain('resource');
    expect(types).toContain('api');
    expect(types).toContain('graphql');
    expect(types).toContain('websocket');
    expect(types).toContain('webhook');
  });
});

describe('ControllerGenerator Edge Cases', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should generate controller with custom methods', async () => {
    const options: ControllerOptions = {
      name: 'CustomController',
      controllerPath: testControllersDir,
      type: 'crud',
      methods: ['custom1', 'custom2'],
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);
  });
});

describe('ControllerGenerator Batch Operations', () => {
  const testControllersDir = path.join(process.cwd(), 'tests', 'tmp', 'controllers');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testControllersDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testControllersDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  it('should handle controller name variations', async () => {
    const variations = ['UserController', 'PostController', 'AdminController'];

    for (const name of variations) {
      const options: ControllerOptions = {
        name,
        controllerPath: testControllersDir,
      };

      const result = ControllerGenerator.validateOptions(options);
      expect(result.valid).toBe(true);
    }
  });

  it('should generate multiple controllers in same directory', async () => {
    const controllers = ['UserController', 'PostController', 'AdminController'];

    const results = await Promise.all(
      controllers.map(async (name) => {
        const options: ControllerOptions = {
          name,
          controllerPath: testControllersDir,
          type: 'crud',
        };
        return ControllerGenerator.generateController(options);
      })
    );
    results.forEach((result) => expect(result.success).toBe(true));

    // Verify all files were created
    const files = await fs.readdir(testControllersDir);
    expect(files).toHaveLength(3);
  });

  it('should default to resource type if not specified', async () => {
    const options: ControllerOptions = {
      name: 'DefaultController',
      controllerPath: testControllersDir,
      // type not specified
    };

    const result = await ControllerGenerator.generateController(options);

    expect(result.success).toBe(true);
  });
});
