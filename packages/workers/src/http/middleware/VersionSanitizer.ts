import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const withVersionValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const version = data['version'] as string;

      if (version && !VERSION_PATTERN.test(version)) {
        return res.setStatus(400).json({
          error: 'Invalid version format',
          message: 'Version must follow semantic versioning (e.g., 1.0.0)',
          code: 'INVALID_VERSION_FORMAT',
        });
      }

      return handler(req, res);
    } catch (error) {
      Logger.error('Version validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
