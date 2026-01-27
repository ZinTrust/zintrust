/**
 * Validate Driver Middleware
 * Ensures the 'driver' query parameter is valid if present.
 */

import type { IRequest, IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const VALID_DRIVERS = new Set(['database', 'redis', 'memory']);

export const withDriverValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const driver = req.getQueryParam('driver');

    // Normalize to string if it's an array (take first)
    const driverValue = Array.isArray(driver) ? driver[0] : driver;

    if (driverValue && !VALID_DRIVERS.has(driverValue)) {
      res.setStatus(400).json({
        error: 'Invalid driver parameter',
        message: 'Driver must be one of: database, redis, memory',
      });
      return;
    }

    return handler(req, res);
  };
};
