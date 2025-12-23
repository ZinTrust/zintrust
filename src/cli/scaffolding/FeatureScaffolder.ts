/**
 * FeatureScaffolder - Generate features within a service
 * Features like authentication, payments, logging, API docs, etc.
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

export type FeatureType =
  | 'auth'
  | 'payments'
  | 'logging'
  | 'api-docs'
  | 'email'
  | 'cache'
  | 'queue'
  | 'websocket';

export interface FeatureOptions {
  name: FeatureType;
  servicePath: string; // Path to service directory
  withTest?: boolean; // Create test file?
}

export interface FeatureScaffoldResult {
  success: boolean;
  featureName: string;
  filesCreated: string[];
  message: string;
}

/**
 * FeatureScaffolder adds features to services
 */
const FEATURE_TEMPLATES: Record<FeatureType, () => string> = {
  auth: () => generateAuthFeature(),
  payments: () => generatePaymentsFeature(),
  logging: () => generateLoggingFeature(),
  'api-docs': () => generateApiDocsFeature(),
  email: () => generateEmailFeature(),
  cache: () => generateCacheFeature(),
  queue: () => generateQueueFeature(),
  websocket: () => generateWebSocketFeature(),
};

/**
 * Validate feature options
 */
export function validateOptions(options: FeatureOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Object.keys(FEATURE_TEMPLATES).includes(options.name)) {
    errors.push(
      `Unknown feature '${options.name}'. Supported: ${Object.keys(FEATURE_TEMPLATES).join(', ')}`
    );
  }

  if (options.servicePath === '' || !FileGenerator.directoryExists(options.servicePath)) {
    errors.push(`Service path does not exist: ${options.servicePath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get available features
 */
export function getAvailableFeatures(): FeatureType[] {
  return Object.keys(FEATURE_TEMPLATES) as FeatureType[];
}

/**
 * Add feature to service
 */
export async function addFeature(options: FeatureOptions): Promise<FeatureScaffoldResult> {
  try {
    const validation = validateOptions(options);
    if (validation.valid === false) {
      return {
        success: false,
        featureName: options.name,
        filesCreated: [],
        message: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    const featureDir = prepareFeatureDirectory(options);
    if (typeof featureDir === 'string' && featureDir.startsWith('Error:')) {
      return {
        success: false,
        featureName: options.name,
        filesCreated: [],
        message: featureDir.replace('Error: ', ''),
      };
    }

    const filesCreated = generateFeatureFiles(options, featureDir);

    Logger.info(`✅ Added feature '${options.name}' with ${filesCreated.length} files`);

    return {
      success: true,
      featureName: options.name,
      filesCreated,
      message: `Feature '${options.name}' added successfully`,
    };
  } catch (error) {
    Logger.error('Feature scaffolding error', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      featureName: options.name,
      filesCreated: [],
      message: `Failed to add feature: ${errorMsg}`,
    };
  }
}

/**
 * Prepare feature directory
 */
function prepareFeatureDirectory(options: FeatureOptions): string {
  const featuresDir = path.join(options.servicePath, 'src', 'features');
  FileGenerator.createDirectory(featuresDir);

  const featureDir = path.join(featuresDir, options.name);
  if (FileGenerator.directoryExists(featureDir)) {
    return `Error: Feature '${options.name}' already exists at ${featureDir}`;
  }

  FileGenerator.createDirectory(featureDir);
  return featureDir;
}

/**
 * Generate feature files
 */
function generateFeatureFiles(options: FeatureOptions, featureDir: string): string[] {
  const filesCreated: string[] = [];
  const generator = FEATURE_TEMPLATES[options.name];

  if (generator === undefined) {
    return [];
  }

  const featureContent = generator();
  const featurePath = path.join(featureDir, 'index.ts');
  FileGenerator.writeFile(featurePath, featureContent);
  filesCreated.push(featurePath);

  if (options.withTest === true) {
    const testPath = path.join(featureDir, `${options.name}.test.ts`);
    FileGenerator.writeFile(testPath, generateFeatureTest(options.name));
    filesCreated.push(testPath);
  }

  const readmePath = path.join(featureDir, 'README.md');
  FileGenerator.writeFile(readmePath, generateFeatureReadme(options.name));
  filesCreated.push(readmePath);

  return filesCreated;
}

// Feature generators
function generateAuthFeature(): string {
  return AUTH_TEMPLATE;
}

function generatePaymentsFeature(): string {
  return PAYMENTS_TEMPLATE;
}

function generateLoggingFeature(): string {
  return LOGGING_TEMPLATE;
}

function generateApiDocsFeature(): string {
  return API_DOCS_TEMPLATE;
}

function generateEmailFeature(): string {
  return EMAIL_TEMPLATE;
}

function generateCacheFeature(): string {
  return CACHE_TEMPLATE;
}

function generateQueueFeature(): string {
  return QUEUE_TEMPLATE;
}

function generateWebSocketFeature(): string {
  return WEBSOCKET_TEMPLATE;
}

const AUTH_TEMPLATE = `/**
 * Authentication Feature
 * Provides JWT and session management
 */

import jwt from 'jsonwebtoken';

export interface AuthConfig {
  secret: string;
  expiresIn: string;
  algorithm: 'HS256' | 'HS512';
}

/**
 * AuthService - Pure Functional Object
 */
export const AuthService = {
  /**
   * Create a new auth service instance
   */
  create(config: AuthConfig) {
    return {
      /**
       * Generate JWT token
       */
      generateToken(payload: Record<string, unknown>): string {
        return jwt.sign(payload, config.secret, {
          expiresIn: config.expiresIn,
          algorithm: config.algorithm,
        });
      },

      /**
       * Verify JWT token
       */
      verifyToken(token: string): Record<string, unknown> | null {
        try {
          return jwt.verify(token, config.secret) as Record<string, unknown>;
        } catch {
          return null;
        }
      },

      /**
       * Decode token (without verification)
       */
      decodeToken(token: string): Record<string, unknown> | null {
        try {
          return jwt.decode(token) as Record<string, unknown> | null;
        } catch {
          return null;
        }
      }
    };
  }
};

export default AuthService;
`;

const PAYMENTS_TEMPLATE = `/**
 * Payments Feature
 * Handles payment processing and transactions
 */

import { randomBytes } from 'node:crypto';

export interface PaymentConfig {
  provider: 'stripe' | 'paypal' | 'square';
  apiKey: string;
  webhookSecret?: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  method: string;
  createdAt: Date;
}

/**
 * PaymentService - Pure Functional Object
 */
export const PaymentService = {
  /**
   * Create a new payment service instance
   */
  create(config: PaymentConfig) {
    return {
      /**
       * Process payment
       */
      async processPayment(payment: Payment): Promise<{ success: boolean; transactionId?: string }> {
        // Implementation depends on provider
        return { success: true, transactionId: 'txn_' + randomBytes(8).toString('hex') };
      },

      /**
       * Refund payment
       */
      async refundPayment(transactionId: string): Promise<{ success: boolean }> {
        return { success: true };
      },

      /**
       * Get payment status
       */
      async getStatus(transactionId: string): Promise<Payment | null> {
        return null;
      }
    };
  }
};

export default PaymentService;
`;

const LOGGING_TEMPLATE = `/**
 * Logging Feature
 * Structured logging with multiple transports
 */

import { Logger } from '@config/logger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * LoggingService - Pure Functional Object
 */
export const LoggingService = {
  /**
   * Create a new logging service instance
   */
  create() {
    let logs: LogEntry[] = [];

    return {
      /**
       * Log message
       */
      log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        const entry: LogEntry = {
          timestamp: new Date(),
          level,
          message,
          context,
        };

        logs.push(entry);

        if (level === 'error') {
          Logger.error(message, context);
        } else if (level === 'warn') {
          Logger.warn(message, context);
        } else {
          Logger.info(message, context);
        }
      },

      /**
       * Get logs
       */
      getLogs(level?: LogLevel, limit: number = 100): LogEntry[] {
        let filtered = logs;
        if (level !== undefined) {
          filtered = filtered.filter((log) => log.level === level);
        }
        return filtered.slice(-limit);
      },

      /**
       * Clear logs
       */
      clear(): void {
        logs = [];
      }
    };
  }
};

export default LoggingService;
`;

const API_DOCS_TEMPLATE = `/**
 * API Documentation Feature
 * Generates OpenAPI/Swagger documentation
 */

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  parameters?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
  tags?: string[];
}

/**
 * ApiDocService - Pure Functional Object
 */
export const ApiDocService = {
  /**
   * Create a new API doc service instance
   */
  create() {
    let endpoints: ApiEndpoint[] = [];

    const service = {
      /**
       * Register endpoint
       */
      registerEndpoint(endpoint: ApiEndpoint): void {
        endpoints.push(endpoint);
      },

      /**
       * Generate OpenAPI spec
       */
      generateOpenApiSpec(): Record<string, unknown> {
        return {
          openapi: '3.0.0',
          info: {
            title: 'Service API',
            version: '1.0.0',
          },
          paths: service.groupByPath(),
        };
      },

      /**
       * Generate Swagger/OpenAPI HTML
       */
      generateSwaggerHtml(): string {
        const spec = service.generateOpenApiSpec();
        return \`<html>
          <body>
            <div id="swagger-ui"></div>
            <script>
              window.onload = function() {
                window.ui = SwaggerUIBundle({
                  spec: \${JSON.stringify(spec)},
                  dom_id: '#swagger-ui',
                });
              };
            </script>
          </body>
        </html>\`;
      },

      groupByPath(): Record<string, unknown> {
        const grouped: Record<string, unknown> = {};
        for (const endpoint of endpoints) {
          if (grouped[endpoint.path] === undefined) {
            grouped[endpoint.path] = {};
          }
          grouped[endpoint.path][endpoint.method.toLowerCase()] = {
            description: endpoint.description,
            parameters: endpoint.parameters,
            requestBody: endpoint.requestBody,
            responses: endpoint.responses,
            tags: endpoint.tags,
          };
        }
        return grouped;
      }
    };

    return service;
  }
};

export default ApiDocService;
`;

const EMAIL_TEMPLATE = `/**
 * Email Feature
 * Handles email sending
 */

import { randomBytes } from 'node:crypto';

export interface EmailConfig {
  provider: 'sendgrid' | 'mailgun' | 'nodemailer';
  apiKey?: string;
  fromAddress: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: string }>;
}

/**
 * EmailService - Pure Functional Object
 */
export const EmailService = {
  /**
   * Create a new email service instance
   */
  create(config: EmailConfig) {
    return {
      /**
       * Send email
       */
      async send(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
        // Implementation depends on provider
        return { success: true, messageId: 'msg_' + randomBytes(8).toString('hex') };
      },

      /**
       * Send template email
       */
      async sendTemplate(
        to: string,
        template: string,
        data: Record<string, unknown>
      ): Promise<{ success: boolean }> {
        return { success: true };
      }
    };
  }
};

export default EmailService;
`;

const CACHE_TEMPLATE = `/**
 * Cache Feature
 * In-memory and distributed caching
 */

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number; // Max cache entries
  backend?: 'memory' | 'redis';
}

/**
 * CacheService - Pure Functional Object
 */
export const CacheService = {
  /**
   * Create a new cache service instance
   */
  create(config: CacheConfig) {
    let cache = new Map<string, { value: unknown; expiresAt: number }>();

    return {
      /**
       * Get cached value
       */
      get<T>(key: string): T | null {
        const entry = cache.get(key);
        if (entry === undefined) return null;

        if (Date.now() > entry.expiresAt) {
          cache.delete(key);
          return null;
        }

        return entry.value as T;
      },

      /**
       * Set cache value
       */
      set<T>(key: string, value: T): void {
        const expiresAt = Date.now() + config.ttl * 1000;
        cache.set(key, { value, expiresAt });
      },

      /**
       * Delete cache entry
       */
      delete(key: string): boolean {
        return cache.delete(key);
      },

      /**
       * Clear all cache
       */
      clear(): void {
        cache.clear();
      }
    };
  }
};

export default CacheService;
`;

const QUEUE_TEMPLATE = `/**
 * Queue Feature
 * Job queue processing
 */

import { randomBytes } from 'node:crypto';

export interface Job {
  id: string;
  name: string;
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
}

export interface QueueConfig {
  backend: 'memory' | 'redis' | 'rabbitmq';
  concurrency?: number;
}

/**
 * QueueService - Pure Functional Object
 */
export const QueueService = {
  /**
   * Create a new queue service instance
   */
  create(config: QueueConfig) {
    let jobs: Job[] = [];
    let processing = false;

    const service = {
      /**
       * Add job to queue
       */
      async enqueue(name: string, data: Record<string, unknown>): Promise<Job> {
        const job: Job = {
          id: 'job_' + randomBytes(8).toString('hex'),
          name,
          data,
          status: 'pending',
          createdAt: new Date(),
        };

        jobs.push(job);
        service.processQueue();
        return job;
      },

      /**
       * Get job status
       */
      getJob(id: string): Job | undefined {
        return jobs.find((job) => job.id === id);
      },

      processQueue(): void {
        if (processing === true) return;
        processing = true;

        // Process queue
        const pendingJobs = jobs.filter((job) => job.status === 'pending');
        for (const job of pendingJobs) {
          job.status = 'completed';
          job.processedAt = new Date();
        }

        processing = false;
      }
    };

    return service;
  }
};

export default QueueService;
`;

const WEBSOCKET_TEMPLATE = `/**
 * WebSocket Feature
 * Real-time communication
 */

export interface WebSocketConfig {
  port?: number;
  cors?: { origin: string | string[] };
}

export interface SocketMessage {
  event: string;
  data: unknown;
  timestamp: Date;
}

/**
 * WebSocketService - Pure Functional Object
 */
export const WebSocketService = {
  /**
   * Create a new websocket service instance
   */
  create() {
    let listeners: Map<string, Set<(data: unknown) => void>> = new Map();

    return {
      /**
       * Listen for event
       */
      on(event: string, callback: (data: unknown) => void): void {
        if (listeners.has(event) === false) {
          listeners.set(event, new Set());
        }
        listeners.get(event)?.add(callback);
      },

      /**
       * Emit event
       */
      emit(event: string, data: unknown): void {
        const callbacks = listeners.get(event);
        if (callbacks !== undefined) {
          for (const callback of callbacks) {
            callback(data);
          }
        }
      },

      /**
       * Stop listening
       */
      off(event: string, callback: (data: unknown) => void): void {
        const callbacks = listeners.get(event);
        if (callbacks !== undefined) {
          callbacks.delete(callback);
        }
      }
    };
  }
};

export default WebSocketService;
`;

/**
 * Generate feature test
 */
function generateFeatureTest(_name: FeatureType): string {
  return `/**
 * \${name} Feature Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('\${name} Feature', () => {
  beforeEach(() => {
    // Setup
  });

  it('should initialize successfully', () => {
    expect(true).toBe(true);
  });

  it('should perform core functionality', () => {
    expect(true).toBe(true);
  });
});
`;
}

/**
 * Generate feature README
 */
function generateFeatureReadme(_name: FeatureType): string {
  return `# \${name.charAt(0).toUpperCase()}\${name.slice(1)} Feature

This feature provides \${name} functionality for the service.

## Usage

\`\`\`typescript
import \${name}Service from './index';

const service = \${name}Service.create(config);
// Use service...
\`\`\`

## Configuration

See service configuration for settings related to this feature.

## Testing

\`\`\`bash
npm test -- \${name}.test.ts
\`\`\`
`;
}

/**
 * FeatureScaffolder adds features to services
 */
export const FeatureScaffolder = Object.freeze({
  validateOptions,
  getAvailableFeatures,
  addFeature,
});
