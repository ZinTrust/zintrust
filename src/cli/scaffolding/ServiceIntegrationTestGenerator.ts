/**
 * Service Integration Test Generator - Phase 7
 * Generates integration tests for service-to-service communication
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

export interface ServiceEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  name: string;
  description?: string;
}

export interface ServiceIntegrationTestOptions {
  name: string;
  serviceName: string;
  baseUrl?: string;
  endpoints: ServiceEndpoint[];
  authType?: 'none' | 'api-key' | 'jwt';
  consumerService?: string;
  testPath: string;
}

export interface ServiceIntegrationTestResult {
  success: boolean;
  testFile: string;
  message: string;
}

/**
 * Service Integration Test Generator - Creates integration tests for microservices
 */
export class ServiceIntegrationTestGenerator {
  public readonly version = '1.0.0';

  private constructor() {
    // Private constructor for static utility class
  }

  /**
   * Generate service integration tests
   */
  public static async generateIntegrationTest(
    options: ServiceIntegrationTestOptions
  ): Promise<ServiceIntegrationTestResult> {
    try {
      const testCode = this.buildTestCode(options);
      const fileName = `${this.camelCase(options.name)}.test.ts`;
      const filePath = path.join(options.testPath, fileName);

      FileGenerator.writeFile(filePath, testCode, { overwrite: true });

      Logger.info(`✅ Created service integration test: ${fileName}`);

      return {
        success: true,
        testFile: filePath,
        message: `Service integration test '${options.name}' created successfully`,
      };
    } catch (error) {
      Logger.error('Service integration test generation failed', error);
      return {
        success: false,
        testFile: '',
        message: (error as Error).message,
      };
    }
  }

  /**
   * Validate integration test options
   */
  public static validateOptions(options: ServiceIntegrationTestOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (options.name === undefined || options.name.trim() === '') {
      errors.push('Integration test name is required');
    } else if (!/^[A-Z][a-zA-Z\d]*Service$/.test(options.name)) {
      errors.push('Integration test name must be PascalCase and end with Service');
    }

    if (options.serviceName === undefined || options.serviceName.trim() === '') {
      errors.push('Service name is required');
    } else if (!/^[a-z\d-]+$/.test(options.serviceName)) {
      errors.push('Service name must be lowercase alphanumeric with hyphens');
    }

    if (options.endpoints === undefined || options.endpoints.length === 0) {
      errors.push('At least one endpoint is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build complete test code
   */
  private static buildTestCode(options: ServiceIntegrationTestOptions): string {
    const baseUrl = this.getBaseUrl(options);
    const endpointTests = this.buildEndpointTests(options);
    const consumerNote = this.getConsumerNote(options);

    return `/**
 * ${this.camelCase(options.name)} Integration Tests
 * Tests service-to-service communication
 * Service: ${options.serviceName}${consumerNote}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

interface ServiceConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

interface TestContext {
  baseUrl: string;
  authToken?: string;
}

${this.buildServiceClientClass()}

${this.buildTestHelpers()}

describe('${options.name} Integration', () => {
  let client: ServiceClient;
  const context: TestContext = {
    baseUrl: '${baseUrl}',
  };

  beforeAll(async () => {
    client = createClient({
      baseUrl: context.baseUrl,
    });

    // Optional: Setup auth or other prerequisites
    if ('${options.authType}' === 'jwt') {
      context.authToken = 'test-token';
    }
  });

  ${endpointTests}
});
`;
  }

  /**
   * Get base URL for tests
   */
  private static getBaseUrl(options: ServiceIntegrationTestOptions): string {
    return options.baseUrl !== undefined && options.baseUrl !== ''
      ? options.baseUrl
      : 'http://localhost:3001';
  }

  /**
   * Build endpoint tests
   */
  private static buildEndpointTests(options: ServiceIntegrationTestOptions): string {
    return options.endpoints.map((ep) => this.buildEndpointTest(ep, options)).join('\n\n  ');
  }

  /**
   * Get consumer note for header
   */
  private static getConsumerNote(options: ServiceIntegrationTestOptions): string {
    return options.consumerService === undefined
      ? ''
      : `\n * Consumer Service: ${options.consumerService}\n`;
  }

  /**
   * Build ServiceClient class code
   */
  private static buildServiceClientClass(): string {
    return `/**
 * Service client for making inter-service calls
 */
class ServiceClient {
  private baseUrl: string;
  private timeout: number = 5000;
  private headers: Record<string, string>;

${this.buildServiceClientConstructor()}

  ${this.buildServiceClientRequestMethod()}

${this.buildServiceClientHttpMethods()}
}`;
  }

  /**
   * Build ServiceClient constructor
   */
  private static buildServiceClientConstructor(): string {
    return `  constructor(config: ServiceConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout !== undefined ? config.timeout : 5000;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }`;
  }

  /**
   * Build ServiceClient HTTP methods
   */
  private static buildServiceClientHttpMethods(): string {
    return `  /**
   * GET request
   */
  async get<T>(path: string, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
    const res = await this.request<T>('GET', path, undefined, headers);
    return { status: res.status, body: res.body };
  }

  /**
   * POST request
   */
  async post<T>(path: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
    const res = await this.request<T>('POST', path, data, headers);
    return { status: res.status, body: res.body };
  }

  /**
   * PUT request
   */
  async put<T>(path: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
    const res = await this.request<T>('PUT', path, data, headers);
    return { status: res.status, body: res.body };
  }

  /**
   * PATCH request
   */
  async patch<T>(path: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
    const res = await this.request<T>('PATCH', path, data, headers);
    return { status: res.status, body: res.body };
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
    const res = await this.request<T>('DELETE', path, undefined, headers);
    return { status: res.status, body: res.body };
  }`;
  }

  /**
   * Build ServiceClient request method
   */
  private static buildServiceClientRequestMethod(): string {
    return `/**
   * Make HTTP request
   */
  async request<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<{ status: number; body: T; headers: Record<string, string> }> {
    const url = \`\${this.baseUrl}\${path}\`;

    try {
      const response = await fetch(url, {
        method,
        headers: { ...this.headers, ...headers },
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(this.timeout),
      });

      const body = await response.json();

      return {
        status: response.status,
        body: body as T,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      throw new Error(\`Service call failed: \${(error as Error).message}\`);
    }
  }`;
  }

  /**
   * Build test helpers
   */
  private static buildTestHelpers(): string {
    return `/**
 * Create test context
 */
function createContext(baseUrl: string): TestContext {
  return { baseUrl };
}

/**
 * Create service client
 */
function createClient(config: ServiceConfig): ServiceClient {
  return new ServiceClient(config);
}

/**
 * Verify service health
 */
async function verifyHealth(client: ServiceClient): Promise<boolean> {
  try {
    const response = await client.get('/health');
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Wait for service to be ready
 */
async function waitForService(client: ServiceClient, retries: number = 5): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    if (await verifyHealth(client)) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}`;
  }

  /**
   * Build test for a single endpoint
   */
  private static buildEndpointTest(
    endpoint: ServiceEndpoint,
    _options: ServiceIntegrationTestOptions
  ): string {
    const methodName = endpoint.method.toLowerCase();
    const hasBody = ['post', 'put', 'patch'].includes(methodName);
    const bodyArg = hasBody ? ', { test: "data" }' : '';

    return `it('should ${endpoint.name} (${endpoint.method} ${endpoint.path})', async () => {
    const response = await client.${methodName}('${endpoint.path}'${bodyArg});
    expect(response.status).toBeLessThan(400);
    expect(response.body).toBeDefined();
  });`;
  }

  /**
   * Helper to convert string to camelCase
   */
  private static camelCase(str: string): string {
    return str
      .replaceAll(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replaceAll(/\s+/g, '');
  }

  /**
   * Get available options
   */
  public static getAvailableOptions(): string[] {
    return [
      'Service-to-service integration tests',
      'Endpoint discovery and testing',
      'Automatic ServiceClient generation',
      'Auth pattern support (JWT, API Key)',
      'Consumer service tracking',
      'Vitest integration',
    ];
  }
}
