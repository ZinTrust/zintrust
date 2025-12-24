/**
 * Service Integration Test Generator
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
 * Validate integration test options
 */
export function validateOptions(options: ServiceIntegrationTestOptions): {
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
 * Generate service integration tests
 */
export async function generateIntegrationTest(
  options: ServiceIntegrationTestOptions
): Promise<ServiceIntegrationTestResult> {
  try {
    const testCode = buildTestCode(options);
    const fileName = `${camelCase(options.name)}.test.ts`;
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
 * Build complete test code
 */
function buildTestCode(options: ServiceIntegrationTestOptions): string {
  const baseUrl = getBaseUrl(options);
  const endpointTests = buildEndpointTests(options);
  const consumerNote = getConsumerNote(options);

  return `/**
 * ${camelCase(options.name)} Integration Tests
 * Tests service-to-service communication
 * Service: ${options.serviceName}${consumerNote}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ErrorFactory } from '@exceptions/ZintrustError';

interface ServiceConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

interface TestContext {
  baseUrl: string;
  authToken?: string;
}

${buildServiceClientObject()}

${buildTestHelpers()}

describe('${options.name} Integration', () => {
  let client: any;
  const context: TestContext = {
    baseUrl: '${baseUrl}',
  };

  beforeAll(async () => {
    client = ServiceClient.create({
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
function getBaseUrl(options: ServiceIntegrationTestOptions): string {
  return options.baseUrl !== undefined && options.baseUrl !== ''
    ? options.baseUrl
    : 'http://localhost:3001';
}

/**
 * Build endpoint tests
 */
function buildEndpointTests(options: ServiceIntegrationTestOptions): string {
  return options.endpoints.map((ep) => buildEndpointTest(ep, options)).join('\n\n  ');
}

/**
 * Get consumer note for header
 */
function getConsumerNote(options: ServiceIntegrationTestOptions): string {
  return options.consumerService === undefined
    ? ''
    : `\n * Consumer Service: ${options.consumerService}\n`;
}

/**
 * Build ServiceClient object code
 */
function buildServiceClientObject(): string {
  return `/**
 * Service client for making inter-service calls
 */
export const ServiceClient = {
  /**
   * Create a new service client instance
   */
  create(config: ServiceConfig) {
    const baseUrl = config.baseUrl;
    const timeout = config.timeout !== undefined ? config.timeout : 5000;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    const client = {
      /**
       * Make HTTP request
       */
      async request<T>(
        method: string,
        path: string,
        data?: Record<string, unknown>,
        headers?: Record<string, string>
      ): Promise<{ status: number; body: T; headers: Record<string, string> }> {
        const url = \\\`\\\${baseUrl}\\\${path}\\\`;

        try {
          const response = await fetch(url, {
            method,
            headers: { ...defaultHeaders, ...headers },
            body: data ? JSON.stringify(data) : undefined,
            signal: AbortSignal.timeout(timeout),
          });

          const body = await response.json();

          return {
            status: response.status,
            body: body as T,
            headers: Object.fromEntries(response.headers.entries()),
          };
        } catch (error) {
          throw ErrorFactory.createTryCatchError(
            \\\`Service call failed: \\\${(error as Error).message}\\\`,
            error
          );
        }
      },

${buildClientMethods()}
    };

    return client;
  }
};`;
}

/**
 * Build client methods for ServiceClient
 */
function buildClientMethods(): string {
  return `      /**
       * GET request
       */
      async get<T>(path: string, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
        const res = await client.request<T>('GET', path, undefined, headers);
        return { status: res.status, body: res.body };
      },

      /**
       * POST request
       */
      async post<T>(path: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
        const res = await client.request<T>('POST', path, data, headers);
        return { status: res.status, body: res.body };
      },

      /**
       * PUT request
       */
      async put<T>(path: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
        const res = await client.request<T>('PUT', path, data, headers);
        return { status: res.status, body: res.body };
      },

      /**
       * PATCH request
       */
      async patch<T>(path: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
        const res = await client.request<T>('PATCH', path, data, headers);
        return { status: res.status, body: res.body };
      },

      /**
       * DELETE request
       */
      async delete<T>(path: string, headers?: Record<string, string>): Promise<{ status: number; body: T }> {
        const res = await client.request<T>('DELETE', path, undefined, headers);
        return { status: res.status, body: res.body };
      }`;
}

/**
 * Build test helpers
 */
function buildTestHelpers(): string {
  return `/**
 * Test helper functions
 */
function createClient(config: ServiceConfig) {
  return ServiceClient.create(config);
}`;
}

/**
 * Build single endpoint test
 */
function buildEndpointTest(
  endpoint: ServiceEndpoint,
  _options: ServiceIntegrationTestOptions
): string {
  const testName = endpoint.name || `should handle ${endpoint.method} ${endpoint.path}`;
  const method = endpoint.method.toLowerCase();
  const hasBody = ['post', 'put', 'patch'].includes(method);
  const bodyArg = hasBody ? ', { test: true }' : '';

  return `it('${testName}', async () => {
    const response = await client.${method}('${endpoint.path}'${bodyArg});

    expect(response.status).toBeLessThan(500);
    expect(response.body).toBeDefined();
  });`;
}

/**
 * Convert to camelCase
 */
function camelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export const ServiceIntegrationTestGenerator = Object.freeze({
  validateOptions,
  generateIntegrationTest,
});
