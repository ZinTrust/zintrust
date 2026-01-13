/**
 * ControllerGenerator - Generate controller files
 * Creates CRUD controllers with validation and error handling
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import * as path from '@node-singletons/path';

export type ControllerType = 'crud' | 'resource' | 'api' | 'graphql' | 'websocket' | 'webhook';

export interface ControllerOptions {
  name: string; // e.g., "UserController"
  controllerPath: string; // Path to app/Controllers/
  type?: ControllerType; // Type of controller
  model?: string; // Associated model name (for CRUD)
  methods?: string[]; // Custom methods
  withValidation?: boolean; // Add validation methods
  withErrorHandling?: boolean; // Add error handling
}

export interface ControllerGeneratorResult {
  success: boolean;
  controllerName: string;
  controllerFile: string;
  message: string;
}

/**
 * ControllerGenerator creates HTTP request handlers
 */
const CONTROLLER_TYPES: Record<ControllerType, (options?: ControllerOptions) => string> = {
  crud: (options) => generateCrudController(options),
  resource: (options) => generateResourceController(options),
  api: (options) => generateApiController(options),
  graphql: (options) => generateGraphQLController(options),
  websocket: (options) => generateWebSocketController(options),
  webhook: (options) => generateWebhookController(options),
};

/**
 * Validate controller options
 */
export function validateOptions(options: ControllerOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (
    options.name === undefined ||
    options.name === '' ||
    /^[A-Z][a-zA-Z\d]*Controller$/.test(options.name) === false
  ) {
    errors.push(`Invalid controller name '${options.name}'. Must end with 'Controller'.`);
  }

  if (
    options.controllerPath === undefined ||
    options.controllerPath === '' ||
    FileGenerator.directoryExists(options.controllerPath) === false
  ) {
    errors.push(`Controllers directory does not exist: ${options.controllerPath}`);
  }

  if (
    options.type !== undefined &&
    Object.keys(CONTROLLER_TYPES).includes(options.type) === false
  ) {
    errors.push(
      `Invalid controller type '${options.type}'. Supported: ${Object.keys(CONTROLLER_TYPES).join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate controller file
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function generateController(options: ControllerOptions): Promise<ControllerGeneratorResult> {
  const validation = validateOptions(options);
  if (validation.valid === false) {
    return Promise.resolve({
      success: false,
      controllerName: options.name,
      controllerFile: '',
      message: `Validation failed: ${validation.errors.join(', ')}`,
    });
  }

  try {
    const controllerType = options.type ?? 'resource';
    const controllerContent = buildControllerCode(options, controllerType);
    const controllerFile = path.join(options.controllerPath, `${options.name}.ts`);

    const created = FileGenerator.writeFile(controllerFile, controllerContent);
    if (created === false) {
      return Promise.resolve({
        success: false,
        controllerName: options.name,
        controllerFile,
        message: `Failed to create controller file`,
      });
    }

    Logger.info(`✅ Generated controller: ${options.name}`);

    return Promise.resolve({
      success: true,
      controllerName: options.name,
      controllerFile,
      message: `Controller ${options.name} created successfully`,
    });
  } catch (error) {
    Logger.error(`Failed to generate controller: ${(error as Error).message}`);
    return Promise.resolve({
      success: false,
      controllerName: options.name,
      controllerFile: '',
      message: `Error: ${(error as Error).message}`,
    });
  }
}

/**
 * Build controller TypeScript code
 */
function buildControllerCode(options: ControllerOptions, type: ControllerType): string {
  if (type === 'crud' || type === 'resource') {
    return generateCrudController(options);
  } else if (type === 'api') {
    return generateApiController(options);
  } else if (type === 'graphql') {
    return generateGraphQLController(options);
  } else if (type === 'websocket') {
    return generateWebSocketController(options);
  } else if (type === 'webhook') {
    return generateWebhookController(options);
  }

  return '';
}

/**
 * Generate CRUD/Resource controller
 */
function generateCrudController(options?: ControllerOptions): string {
  const modelName = options?.model ?? 'Model';
  const className = options?.name ?? 'ResourceController';

  return `/**
 * ${className}
 * Auto-generated CRUD controller
 */

import { type IRequest, type IResponse, Controller } from '@zintrust/core';
import { ${modelName} } from '@app/Models/${modelName}';

function handleError(res: IResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.setStatus(500).json({ error: message });
}

const controller = Object.freeze({
  ...Controller,
${buildIndexMethod(modelName)},

${buildShowMethod(modelName)},

${buildStoreMethod(modelName)},

${buildUpdateMethod(modelName)},

${buildDestroyMethod(modelName)},
});

export type ${className}Api = typeof controller;

export const ${className} = Object.freeze({
  create(): ${className}Api {
    return controller;
  },
});

export default ${className};
`;
}

/**
 * Build index method
 */
function buildIndexMethod(modelName: string): string {
  return `  /**
   * GET /
   * List all records
   */
  async index(req: IRequest, res: IResponse): Promise<void> {
    try {
      const page = req.getQuery('page') as string || '1';
      const limit = req.getQuery('limit') as string || '10';

      const records = await ${modelName}.query()
        .limit(parseInt(limit, 10))
        .offset((parseInt(page, 10) - 1) * parseInt(limit, 10))
        .get();

      res.json({
        data: records,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });
    } catch (error) {
      handleError(res, error);
    }
  }`;
}

/**
 * Build show method
 */
function buildShowMethod(modelName: string): string {
  return `  /**
   * GET /:id
   * Show single record
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    try {
      const id = req.getParam('id');
      const record = await ${modelName}.find(id);

      if (record === null) {
        return res.setStatus(404).json({ error: 'Not found' });
      }

      res.json({ data: record });
    } catch (error) {
      handleError(res, error);
    }
  }`;
}

/**
 * Build store method
 */
function buildStoreMethod(modelName: string): string {
  return `  /**
   * POST /
   * Create new record
   */
  async store(req: IRequest, res: IResponse): Promise<void> {
    try {
      const body = req.getBody() as Record<string, unknown>;
      const record = await ${modelName}.create(body);

      res.setStatus(201).json({ data: record });
    } catch (error) {
      handleError(res, error);
    }
  }`;
}

/**
 * Build update method
 */
function buildUpdateMethod(modelName: string): string {
  return `  /**
   * PUT /:id
   * Update record
   */
  async update(req: IRequest, res: IResponse): Promise<void> {
    try {
      const id = req.getParam('id');
      const body = req.getBody() as Record<string, unknown>;

      const record = await ${modelName}.find(id);
      if (record === null) {
        return res.setStatus(404).json({ error: 'Not found' });
      }

      record.fill(body);
      await record.save();

      res.json({ data: record });
    } catch (error) {
      handleError(res, error);
    }
  }`;
}

/**
 * Build destroy method
 */
function buildDestroyMethod(modelName: string): string {
  return `  /**
   * DELETE /:id
   * Delete record
   */
  async destroy(req: IRequest, res: IResponse): Promise<void> {
    try {
      const id = req.getParam('id');
      const record = await ${modelName}.find(id);

      if (record === null) {
        return res.setStatus(404).json({ error: 'Not found' });
      }

      await record.delete();
      res.setStatus(204).send();
    } catch (error) {
      handleError(res, error);
    }
  }`;
}

/**
 * Generate Resource controller (alias for CRUD)
 */
function generateResourceController(options?: ControllerOptions): string {
  return generateCrudController(options);
}

/**
 * Generate API controller
 */
function generateApiController(options?: ControllerOptions): string {
  const className = options?.name ?? 'ApiController';

  return `/**
 * ${className}
 * Auto-generated API controller
 */

import { type IRequest, type IResponse, Controller } from '@zintrust/core';

function handleError(res: IResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.setStatus(500).json({ error: message });
}

const controller = Object.freeze({\n  ...Controller,
${buildApiControllerBody()},
});

export type ${className}Api = typeof controller;

export const ${className} = Object.freeze({
  create(): ${className}Api {
    return controller;
  },
});

export default ${className};
`;
}

/**
 * Build API controller body
 */
function buildApiControllerBody(): string {
  return `${buildApiMainHandler()},

${buildApiMethodHandlers()},
`;
}

/**
 * Build API main handler
 */
function buildApiMainHandler(): string {
  return `  /**
   * API endpoint template
   */
  async handleRequest(req: IRequest, res: IResponse): Promise<void> {
    try {
      const method = req.getMethod();

      // Route to appropriate handler
      if (method === 'GET') {
        await controller.handleGet(req, res);
      } else if (method === 'POST') {
        await controller.handlePost(req, res);
      } else if (method === 'PUT') {
        await controller.handlePut(req, res);
      } else if (method === 'DELETE') {
        await controller.handleDelete(req, res);
      } else {
        res.setStatus(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      handleError(res, error);
    }
  }`;
}

/**
 * Build API method handlers
 */
function buildApiMethodHandlers(): string {
  return `  /**
   * Handle GET requests
   */
  async handleGet(_req: IRequest, res: IResponse): Promise<void> {
    res.json({ message: 'GET endpoint' });
  },

  /**
   * Handle POST requests
   */
  async handlePost(_req: IRequest, res: IResponse): Promise<void> {
    res.setStatus(201).json({ message: 'POST endpoint' });
  },

  /**
   * Handle PUT requests
   */
  async handlePut(_req: IRequest, res: IResponse): Promise<void> {
    res.json({ message: 'PUT endpoint' });
  },

  /**
   * Handle DELETE requests
   */
  async handleDelete(_req: IRequest, res: IResponse): Promise<void> {
    res.setStatus(204).send();
  }`;
}

/**
 * Generate GraphQL controller
 */
function generateGraphQLController(options?: ControllerOptions): string {
  const className = options?.name ?? 'GraphQLController';

  return `/**
 * ${className}
 * Auto-generated GraphQL controller
 */

import { type IRequest, type IResponse, Controller } from '@zintrust/core';

function handleError(res: IResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'GraphQL error';
  res.setStatus(500).json({ errors: [{ message }] });
}

const controller = Object.freeze({\n  ...Controller,
  /**
   * GraphQL endpoint
   */
  async handle(req: IRequest, res: IResponse): Promise<void> {
    try {
      if (req.getMethod() !== 'POST') {
        res.setStatus(405).json({ error: 'Method not allowed' });
        return;
      }

      const body = req.getBody() as Record<string, unknown>;
      const query = body.query as string;

      // TODO: Execute GraphQL query
      const result = await controller.executeQuery(query);

      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  },

  /**
   * Execute GraphQL query
   */
  async executeQuery(query: string): Promise<Record<string, unknown>> {
    // TODO: Implement GraphQL execution
    return { data: null };
  },
});

export type ${className}Api = typeof controller;

export const ${className} = Object.freeze({
  create(): ${className}Api {
    return controller;
  },
});

export default ${className};
`;
}

/**
 * Generate WebSocket controller
 */
function generateWebSocketController(options?: ControllerOptions): string {
  const className = options?.name ?? 'WebSocketController';

  return `/**
 * ${className}
 * Auto-generated WebSocket controller
 */

import { Logger } from '@config/logger';

const controller = Object.freeze({
  /**
   * Handle WebSocket connection
   */
  async onConnect(socket: { id: string }): Promise<void> {
    Logger.info('Client connected:', { socketId: socket.id });
  },

  /**
   * Handle WebSocket message
   */
  async onMessage(socket: { emit: (event: string, data: unknown) => void }, message: unknown): Promise<void> {
    Logger.info('Message received:', { message });
    socket.emit('message', { echo: message });
  },

  /**
   * Handle WebSocket disconnect
   */
  async onDisconnect(socket: { id: string }): Promise<void> {
    Logger.info('Client disconnected:', { socketId: socket.id });
  },
});

export type ${className}Api = typeof controller;

export const ${className} = Object.freeze({
  create(): ${className}Api {
    return controller;
  },
});

export default ${className};
`;
}

/**
 * Generate Webhook controller
 */
function generateWebhookController(options?: ControllerOptions): string {
  const className = options?.name ?? 'WebhookController';

  return `/**
 * ${className}
 * Auto-generated Webhook controller
 */

import { type IRequest, type IResponse, Controller } from '@zintrust/core';
import { Logger } from '@config/logger';

function handleError(res: IResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Webhook error';
  res.setStatus(500).json({ error: message });
}

const controller = Object.freeze({\n  ...Controller,
${buildWebhookControllerBody()},
});

export type ${className}Api = typeof controller;

export const ${className} = Object.freeze({
  create(): ${className}Api {
    return controller;
  },
});

export default ${className};
`;
}

/**
 * Build Webhook controller body
 */
function buildWebhookControllerBody(): string {
  return `  /**
   * Handle incoming webhook
   */
  async handle(req: IRequest, res: IResponse): Promise<void> {
    try {
      // Verify webhook signature
      const signature = req.getHeader('x-webhook-signature');
      if (controller.verifySignature(req, signature as string) === false) {
        res.setStatus(401).json({ error: 'Invalid signature' });
        return;
      }

      const body = req.getBody();
      await controller.processWebhook(body);

      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  },

  /**
   * Verify webhook signature
   */
   verifySignature(req: IRequest, signature: string): boolean {
    // TODO: Implement signature verification
    return true;
  },

  /**
   * Process webhook payload
   */
  async processWebhook(payload: unknown): Promise<void> {
    // TODO: Implement webhook processing
    Logger.info('Processing webhook:', { payload });
  },
`;
}

/**
 * Get available controller types
 */
export function getAvailableTypes(): ControllerType[] {
  return Object.keys(CONTROLLER_TYPES) as ControllerType[];
}

/**
 * ControllerGenerator creates HTTP request handlers
 */
export const ControllerGenerator = Object.freeze({
  validateOptions,
  generateController,
  getAvailableTypes,
});
