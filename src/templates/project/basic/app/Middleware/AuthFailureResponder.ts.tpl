import type { MiddlewareFailureResponder } from '@zintrust/core';

export const authFailureResponder: MiddlewareFailureResponder = async (_req, res, context) => {
  res.setStatus(context.statusCode).json({
    error: {
      code: context.reason,
      message: context.message,
    },
  });
};
