import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const QUEUE_NAME_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/;

export const withQueueNameValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const queueName = data['queueName'] as string;

      if (!queueName) {
        return res.setStatus(400).json({
          error: 'Queue name is required',
          code: 'MISSING_QUEUE_NAME',
        });
      }

      if (!QUEUE_NAME_PATTERN.test(queueName)) {
        return res.setStatus(400).json({
          error: 'Invalid queue name',
          message:
            'Queue name must be 3-50 characters long and contain only letters, numbers, hyphens, and underscores',
          code: 'INVALID_QUEUE_NAME',
        });
      }

      // Sanitize the queue name
      const sanitizedQueueName = queueName
        .trim()
        .replaceAll(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 50);

      if (sanitizedQueueName.length < 3) {
        return res.setStatus(400).json({
          error: 'Queue name too short after sanitization',
          message: 'Queue name must be at least 3 characters long',
          code: 'QUEUE_NAME_TOO_SHORT',
        });
      }

      const currentBody = req.getBody() as Record<string, unknown>;
      req.setBody({ ...currentBody, queueName: sanitizedQueueName });

      return handler(req, res);
    } catch (error) {
      Logger.error('Queue name validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
