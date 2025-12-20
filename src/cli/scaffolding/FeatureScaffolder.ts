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
    // Validate options
    const validation = validateOptions(options);
    if (!validation.valid) {
      return {
        success: false,
        featureName: options.name,
        filesCreated: [],
        message: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    const filesCreated: string[] = [];

    // Ensure features directory exists
    const featuresDir = path.join(options.servicePath, 'src', 'features');
    FileGenerator.createDirectory(featuresDir);

    // Create feature directory
    const featureDir = path.join(featuresDir, options.name);
    if (FileGenerator.directoryExists(featureDir)) {
      return {
        success: false,
        featureName: options.name,
        filesCreated: [],
        message: `Feature '${options.name}' already exists at ${featureDir}`,
      };
    }

    FileGenerator.createDirectory(featureDir);

    // Get feature template
    const generator = FEATURE_TEMPLATES[options.name];
    if (generator === undefined) {
      return {
        success: false,
        featureName: options.name,
        filesCreated: [],
        message: `No template found for feature '${options.name}'`,
      };
    }

    // Generate feature files
    const featureContent = generator();
    const featurePath = path.join(featureDir, 'index.ts');
    FileGenerator.writeFile(featurePath, featureContent);

    // Create test file if requested
    let testPath: string | undefined;
    if (options.withTest === true) {
      testPath = path.join(featureDir, `${options.name}.test.ts`);
      const testContent = generateFeatureTest(options.name);
      FileGenerator.writeFile(testPath, testContent);
    }

    // Create feature README
    const readmePath = path.join(featureDir, 'README.md');
    const readmeContent = generateFeatureReadme(options.name);
    FileGenerator.writeFile(readmePath, readmeContent);

    filesCreated.push(featurePath);
    if (testPath !== undefined) filesCreated.push(testPath);
    filesCreated.push(readmePath);

    Logger.info(`✅ Added feature '${options.name}' with ${filesCreated.length} files`);

    return {
      success: true,
      featureName: options.name,
      filesCreated,
      message: `Feature '${options.name}' added successfully`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    Logger.error('Feature scaffolding error:', error);
    return {
      success: false,
      featureName: options.name,
      filesCreated: [],
      message: `Failed to add feature: ${errorMsg}`,
    };
  }
}

// Feature generators
function generateAuthFeature(): string {
  return `/**
 * Authentication Feature
 * Provides JWT and session management
 */

import jwt from 'jsonwebtoken';

export interface AuthConfig {
  secret: string;
  expiresIn: string;
  algorithm: 'HS256' | 'HS512';
}

export class AuthService {
  constructor(private config: AuthConfig) {}

  /**
   * Generate JWT token
   */
  public generateToken(payload: Record<string, unknown>): string {
    return jwt.sign(payload, this.config.secret, {
      expiresIn: this.config.expiresIn,
      algorithm: this.config.algorithm,
    });
  }

  /**
   * Verify JWT token
   */
  public verifyToken(token: string): Record<string, unknown> | null {
    try {
      return jwt.verify(token, this.config.secret) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Decode token (without verification)
   */
  public decodeToken(token: string): Record<string, unknown> | null {
    try {
      return jwt.decode(token) as Record<string, unknown> | null;
    } catch {
      return null;
    }
  }
}

export default AuthService;
`;
}

function generatePaymentsFeature(): string {
  return `/**
 * Payments Feature
 * Handles payment processing and transactions
 */

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

export class PaymentService {
  constructor(private config: PaymentConfig) {}

  /**
   * Process payment
   */
  public async processPayment(payment: Payment): Promise<{ success: boolean; transactionId?: string }> {
    // Implementation depends on provider
    return { success: true, transactionId: 'txn_' + Math.random().toString(36).slice(2) };
  }

  /**
   * Refund payment
   */
  public async refundPayment(transactionId: string): Promise<{ success: boolean }> {
    return { success: true };
  }

  /**
   * Get payment status
   */
  public async getStatus(transactionId: string): Promise<Payment | null> {
    return null;
  }
}

export default PaymentService;
`;
}

function generateLoggingFeature(): string {
  return `/**
 * Logging Feature
 * Structured logging with multiple transports
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export class LoggingService {
  private logs: LogEntry[] = [];

  /**
   * Log message
   */
  public log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
    };

    this.logs.push(entry);

    if (level === 'error') {
      Logger.error(message, context);
    } else if (level === 'warn') {
      Logger.warn(message, context);
    } else {
      Logger.info(message, context);
    }
  }

  /**
   * Get logs
   */
  public getLogs(level?: LogLevel, limit: number = 100): LogEntry[] {
    let filtered = this.logs;
    if (level) {
      filtered = filtered.filter((log) => log.level === level);
    }
    return filtered.slice(-limit);
  }

  /**
   * Clear logs
   */
  public clear(): void {
    this.logs = [];
  }
}

export default LoggingService;
`;
}

function generateApiDocsFeature(): string {
  return `/**
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

export class ApiDocService {
  private endpoints: ApiEndpoint[] = [];

  /**
   * Register endpoint
   */
  public registerEndpoint(endpoint: ApiEndpoint): void {
    this.endpoints.push(endpoint);
  }

  /**
   * Generate OpenAPI spec
   */
  public generateOpenApiSpec(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'Service API',
        version: '1.0.0',
      },
      paths: this.groupByPath(),
    };
  }

  /**
   * Generate Swagger/OpenAPI HTML
   */
  public generateSwaggerHtml(): string {
    const spec = this.generateOpenApiSpec();
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
  }

  private groupByPath(): Record<string, unknown> {
    const grouped: Record<string, unknown> = {};
    for (const endpoint of this.endpoints) {
      if (!grouped[endpoint.path]) {
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
}

export default ApiDocService;
`;
}

function generateEmailFeature(): string {
  return `/**
 * Email Feature
 * Handles email sending
 */

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

export class EmailService {
  constructor(private config: EmailConfig) {}

  /**
   * Send email
   */
  public async send(message: EmailMessage): Promise<{ success: boolean; messageId?: string }> {
    // Implementation depends on provider
    return { success: true, messageId: 'msg_' + Math.random().toString(36).slice(2) };
  }

  /**
   * Send template email
   */
  public async sendTemplate(
    to: string,
    template: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean }> {
    return { success: true };
  }
}

export default EmailService;
`;
}

function generateCacheFeature(): string {
  return `/**
 * Cache Feature
 * In-memory and distributed caching
 */

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number; // Max cache entries
  backend?: 'memory' | 'redis';
}

export class CacheService {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private config: CacheConfig) {}

  /**
   * Get cached value
   */
  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set cache value
   */
  public set<T>(key: string, value: T): void {
    const expiresAt = Date.now() + this.config.ttl * 1000;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Delete cache entry
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    this.cache.clear();
  }
}

export default CacheService;
`;
}

function generateQueueFeature(): string {
  return `/**
 * Queue Feature
 * Job queue processing
 */

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

export class QueueService {
  private jobs: Job[] = [];
  private processing = false;

  constructor(private config: QueueConfig) {}

  /**
   * Add job to queue
   */
  public async enqueue(name: string, data: Record<string, unknown>): Promise<Job> {
    const job: Job = {
      id: 'job_' + Math.random().toString(36).slice(2),
      name,
      data,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.push(job);
    this.processQueue();
    return job;
  }

  /**
   * Get job status
   */
  public getJob(id: string): Job | undefined {
    return this.jobs.find((job) => job.id === id);
  }

  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;

    // Process queue
    const pendingJobs = this.jobs.filter((job) => job.status === 'pending');
    for (const job of pendingJobs) {
      job.status = 'completed';
      job.processedAt = new Date();
    }

    this.processing = false;
  }
}

export default QueueService;
`;
}

function generateWebSocketFeature(): string {
  return `/**
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

export class WebSocketService {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  /**
   * Listen for event
   */
  public on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  /**
   * Emit event
   */
  public emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data);
      }
    }
  }

  /**
   * Stop listening
   */
  public off(event: string, callback: (data: unknown) => void): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }
}

export default WebSocketService;
`;
}

/**
 * Generate feature test
 */
function generateFeatureTest(name: FeatureType): string {
  return `/**
 * ${name} Feature Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('${name} Feature', () => {
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
function generateFeatureReadme(name: FeatureType): string {
  return `# ${name.charAt(0).toUpperCase()}${name.slice(1)} Feature

This feature provides ${name} functionality for the service.

## Usage

\`\`\`typescript
import ${name}Service from './index';

const service = new ${name}Service(config);
// Use service...
\`\`\`

## Configuration

See service configuration for settings related to this feature.

## Testing

\`\`\`bash
npm test -- ${name}.test.ts
\`\`\`
`;
}

/**
 * FeatureScaffolder adds features to services
 */
export const FeatureScaffolder = {
  validateOptions,
  getAvailableFeatures,
  addFeature,
};
