/**
 * Error Routing
 * Centralizes 404/500 handling and HTML error page rendering.
 */

import { appConfig } from '@config/app';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import { getPublicRoot } from '@core-routes/publicRoot';
import type { IRouter } from '@core-routes/Router';
import { Router } from '@core-routes/Router';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ErrorPageRenderer } from '@http/error-pages/ErrorPageRenderer';
import { ErrorResponse } from '@http/ErrorResponse';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import type * as http from '@node-singletons/http';

// Cache Set at module level to avoid repeated creation
const REDACTED_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);

const redactHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (REDACTED_HEADERS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = value;
  }
  return out;
};

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return '';
  }
};

const trySendHtmlErrorPage = (
  request: IRequest,
  response: IResponse,
  input: {
    statusCode: number;
    errorName: string;
    errorMessage: string;
    stackPretty?: string;
    stackRaw?: string;
    requestPretty?: string;
    requestRaw?: string;
  }
): boolean => {
  if (!ErrorPageRenderer.shouldSendHtml(request)) return false;

  const publicRoot = getPublicRoot();
  const html = ErrorPageRenderer.renderHtml(publicRoot, {
    statusCode: input.statusCode,
    errorName: input.errorName,
    errorMessage: input.errorMessage,
    requestPath: request.getPath(),
    stackPretty: input.stackPretty,
    stackRaw: input.stackRaw,
    requestPretty: input.requestPretty,
    requestRaw: input.requestRaw,
  });

  if (html === undefined) return false;

  response.html(html);
  return true;
};

const handleNotFound = (request: IRequest, response: IResponse, requestId?: string): void => {
  response.setStatus(404);

  if (
    trySendHtmlErrorPage(request, response, {
      statusCode: 404,
      errorName: 'Not Found',
      errorMessage: 'The page you requested could not be found.',
    })
  ) {
    return;
  }

  response.json(ErrorResponse.notFound('Route', requestId));
};

const handleInternalServerErrorWithWrappers = (
  request: IRequest,
  response: IResponse,
  error: unknown,
  requestId?: string
): void => {
  response.setStatus(500);

  const isDev = appConfig.isDevelopment();
  const err =
    error instanceof Error ? error : ErrorFactory.createGeneralError('Unknown error', error);

  const errorName = isDev ? err.name || 'Error' : 'Internal Server Error';
  const errorMessage = isDev
    ? err.message || 'An error has occurred'
    : 'Something went wrong while handling your request.';

  const requestObj = isDev
    ? {
        method: request.getMethod(),
        path: request.getPath(),
        query: request.getQuery(),
        headers: redactHeaders(request.getHeaders() as unknown as Record<string, unknown>),
      }
    : undefined;

  const requestPretty =
    requestObj === undefined
      ? undefined
      : `Request\n\nMethod: ${requestObj.method}\nPath: ${requestObj.path}\n\nHeaders:\n${safeJsonStringify(
          requestObj.headers
        )}\n\nQuery:\n${safeJsonStringify(requestObj.query)}`;

  const requestRaw = requestObj === undefined ? undefined : safeJsonStringify(requestObj);

  const stackPretty = isDev ? (err.stack ?? '') : undefined;
  const stackRaw = isDev
    ? safeJsonStringify({ name: err.name, message: err.message, stack: err.stack })
    : undefined;

  if (
    trySendHtmlErrorPage(request, response, {
      statusCode: 500,
      errorName,
      errorMessage,
      stackPretty,
      stackRaw,
      requestPretty,
      requestRaw,
    })
  ) {
    return;
  }

  response.json(
    ErrorResponse.internalServerError(
      'Internal server error',
      requestId,
      isDev ? err.stack : undefined
    )
  );
};

const handleInternalServerErrorRaw = (res: http.ServerResponse): void => {
  res.writeHead(500, { [HTTP_HEADERS.CONTENT_TYPE]: MIME_TYPES.JSON });
  res.end(JSON.stringify(ErrorResponse.internalServerError('Internal server error')));
};

const handleForced404 = (req: IRequest, res: IResponse): void => {
  handleNotFound(req, res);
};

const handleForced500 = (req: IRequest, res: IResponse): void => {
  const forced = ErrorFactory.createGeneralError('Forced 500 route', {
    route: '/500',
  });
  handleInternalServerErrorWithWrappers(req, res, forced);
};

/**
 * Debug routes to always render 404/500 responses.
 */
export const registerErrorRoutes = (router: IRouter): void => {
  Router.get(router, '/404', handleForced404);
  Router.get(router, '/500', handleForced500);
};

export const ErrorRouting = Object.freeze({
  getPublicRoot,
  registerErrorRoutes,
  handleNotFound,
  handleInternalServerErrorWithWrappers,
  handleInternalServerErrorRaw,
});

export default ErrorRouting;
