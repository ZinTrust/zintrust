import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

/**
 * Middleware to strip unknown properties from the request body.
 * Only properties included in the allowedKeys list are preserved.
 */
export const withStrictPayloadKeys = (
  allowedKeys: string[],
  handler: RouteHandler
): RouteHandler => {
  const allowedSet = new Set(allowedKeys);

  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        // If body is not an object, skip stripping or strictly enforce object?
        // For worker creation, it must be an object.
        // Let's rely on downstream validators to complain if data is missing/wrong type.
        return handler(req, res);
      }

      const body = data as Record<string, unknown>;
      const strippedBody: Record<string, unknown> = {};
      let hasUnknowns = false;

      for (const key of Object.keys(body)) {
        if (allowedSet.has(key)) {
          strippedBody[key] = body[key];
        } else {
          hasUnknowns = true;
        }
      }

      if (hasUnknowns) {
        // Update the body with sanitized version
        req.setBody(strippedBody);
      }

      return handler(req, res);
    } catch (error) {
      Logger.error('Strict payload validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
