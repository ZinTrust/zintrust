export interface IErrorResponse {
  statusCode: number;
  message: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: Record<string, unknown>;
  stack?: string;
}

const create = (params: {
  statusCode: number;
  message: string;
  code: string;
  requestId?: string;
  details?: Record<string, unknown>;
  stack?: string;
}): IErrorResponse => {
  const hasStack = typeof params.stack === 'string' && params.stack.trim().length > 0;
  return {
    statusCode: params.statusCode,
    message: params.message,
    code: params.code,
    requestId: params.requestId ?? '',
    timestamp: new Date().toISOString(),
    ...(params.details ? { details: params.details } : {}),
    ...(hasStack ? { stack: params.stack } : {}),
  };
};

export const ErrorResponse = Object.freeze({
  create,

  notFound(resource: string, requestId?: string): IErrorResponse {
    return create({
      statusCode: 404,
      message: `${resource} not found`,
      code: 'NOT_FOUND',
      requestId,
    });
  },

  badRequest(
    message: string,
    requestId?: string,
    details?: Record<string, unknown>
  ): IErrorResponse {
    return create({ statusCode: 400, message, code: 'BAD_REQUEST', requestId, details });
  },

  unauthorized(message: string, requestId?: string): IErrorResponse {
    return create({ statusCode: 401, message, code: 'UNAUTHORIZED', requestId });
  },

  forbidden(message: string, requestId?: string): IErrorResponse {
    return create({ statusCode: 403, message, code: 'FORBIDDEN', requestId });
  },

  conflict(message: string, requestId?: string): IErrorResponse {
    return create({ statusCode: 409, message, code: 'CONFLICT', requestId });
  },

  internalServerError(
    message: string = 'Internal server error',
    requestId?: string,
    stack?: string
  ): IErrorResponse {
    return create({ statusCode: 500, message, code: 'INTERNAL_SERVER_ERROR', requestId, stack });
  },

  serviceUnavailable(message: string = 'Service unavailable', requestId?: string): IErrorResponse {
    return create({ statusCode: 503, message, code: 'SERVICE_UNAVAILABLE', requestId });
  },
});

export default ErrorResponse;
