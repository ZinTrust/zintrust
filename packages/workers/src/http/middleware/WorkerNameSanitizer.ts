import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const WORKER_NAME_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/;

export const withWorkerNameValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const workerName = data['name'] as string;

      if (!workerName) {
        return res.setStatus(400).json({
          error: 'Worker name is required',
          code: 'MISSING_WORKER_NAME',
        });
      }

      if (!WORKER_NAME_PATTERN.test(workerName)) {
        return res.setStatus(400).json({
          error: 'Invalid worker name',
          message:
            'Worker name must be 3-50 characters long and contain only letters, numbers, hyphens, and underscores',
          code: 'INVALID_WORKER_NAME',
        });
      }

      // Sanitize the name
      const sanitizedName = workerName
        .trim()
        .replaceAll(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 50);

      if (sanitizedName.length < 3) {
        return res.setStatus(400).json({
          error: 'Worker name too short after sanitization',
          message: 'Worker name must be at least 3 characters long',
          code: 'WORKER_NAME_TOO_SHORT',
        });
      }

      // Update the request data with sanitized value
      const currentBody = req.getBody() as Record<string, unknown>;
      req.setBody({ ...currentBody, name: sanitizedName });

      return handler(req, res);
    } catch (error) {
      Logger.error('Worker name validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
