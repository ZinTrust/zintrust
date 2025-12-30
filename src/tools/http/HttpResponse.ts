/**
 * HttpResponse - Response wrapper with utility methods
 * Provides convenient access to response status, headers, body, and parsed JSON
 */

import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * HTTP Response interface for convenience methods
 */
export interface IHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  json<T = unknown>(): T;
  text(): string;
  ok: boolean;
  successful: boolean;
  failed: boolean;
  serverError: boolean;
  clientError: boolean;
  header(name: string): string | undefined;
  hasHeader(name: string): boolean;
  throwIfServerError(): IHttpResponse;
  throwIfClientError(): IHttpResponse;
}

/**
 * Create HTTP response from fetch Response
 */
export const createHttpResponse = (response: Response, body: string): IHttpResponse => {
  const statusCode = response.status;
  const headers = Object.fromEntries(response.headers.entries());
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get status(): number {
      return statusCode;
    },

    get headers(): Record<string, string> {
      return headers;
    },

    get body(): string {
      return body;
    },

    json<T = unknown>(): T {
      try {
        return JSON.parse(body) as T;
      } catch (error) {
        throw ErrorFactory.createValidationError('Failed to parse JSON response', {
          body: body.substring(0, 200), // Truncate for logging
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    text(): string {
      return body;
    },

    get ok(): boolean {
      return response.ok;
    },

    get successful(): boolean {
      return statusCode >= 200 && statusCode < 300;
    },

    get failed(): boolean {
      return !this.successful;
    },

    get serverError(): boolean {
      return statusCode >= 500;
    },

    get clientError(): boolean {
      return statusCode >= 400 && statusCode < 500;
    },

    header(name: string): string | undefined {
      return lowerHeaders[name.toLowerCase()];
    },

    hasHeader(name: string): boolean {
      return name.toLowerCase() in lowerHeaders;
    },

    throwIfServerError(): IHttpResponse {
      if (this.serverError) {
        throw ErrorFactory.createTryCatchError(`HTTP server error: ${this.status}`, {
          status: this.status,
          body: this.body.substring(0, 200),
        });
      }
      return this;
    },

    throwIfClientError(): IHttpResponse {
      if (this.clientError) {
        throw ErrorFactory.createTryCatchError(`HTTP client error: ${this.status}`, {
          status: this.status,
          body: this.body.substring(0, 200),
        });
      }
      return this;
    },
  };
};

export default {
  createHttpResponse,
};
