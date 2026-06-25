import { ErrorFactory } from '@zintrust/core/runtime';

export const createRpcValidationError = (message: string, details?: unknown): Error => {
  return ErrorFactory.createValidationError(message, details);
};

export const createRpcUnauthorizedError = (message: string, details?: unknown): Error => {
  return ErrorFactory.createUnauthorizedError(message, details);
};

export const createRpcNotFoundError = (message: string, details?: unknown): Error => {
  return ErrorFactory.createNotFoundError(message, details);
};

export const createRpcFailureError = (message: string, details?: unknown): Error => {
  return ErrorFactory.createTryCatchError(message, details);
};

export const toErrorPayload = (error: unknown): Readonly<{ status: number; body: unknown }> => {
  const value = error as Partial<Error> & { code?: string; statusCode?: number; details?: unknown };
  const code = typeof value.code === 'string' && value.code.length > 0 ? value.code : 'REDIS_RPC_ERROR';
  const message = typeof value.message === 'string' && value.message.length > 0 ? value.message : 'Redis RPC request failed';
  const status = typeof value.statusCode === 'number' && value.statusCode >= 400 ? value.statusCode : 500;

  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        details: value.details,
      },
    },
  };
};
