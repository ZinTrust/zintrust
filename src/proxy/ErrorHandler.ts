import { Logger } from '@config/logger';

export type ProxyErrorResponse = Readonly<{
  status: number;
  body: { code: string; message: string };
}>;

const toProxyError = (status: number, code: string, message: string): ProxyErrorResponse => ({
  status,
  body: { code, message },
});

/**
 * Build an error response for an unexpected internal failure.
 * The original error is logged server-side only; clients receive a generic message so
 * driver errors, SQL fragments and hostnames are never disclosed.
 */
const toProxyServerError = (
  status: number,
  code: string,
  error: unknown,
  publicMessage = 'Internal server error'
): ProxyErrorResponse => {
  Logger.error(`[${code}] ${publicMessage}`, error);
  return toProxyError(status, code, publicMessage);
};

export const ErrorHandler = Object.freeze({
  toProxyError,
  toProxyServerError,
});
