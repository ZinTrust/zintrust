import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

interface OptionsConfig {
  concurrency: number;
  limiter: {
    max: number;
    duration: number;
  };
}

const validateConcurrency = (concurrency: unknown): string | null => {
  if (concurrency === undefined || concurrency === null) {
    return 'Concurrency is required';
  }

  if (typeof concurrency !== 'number') {
    return 'Concurrency must be a number';
  }

  if (!Number.isInteger(concurrency)) {
    return 'Concurrency must be a whole number (integer)';
  }

  if (concurrency < 1) {
    return 'Concurrency must be at least 1';
  }

  const MAX_CONCURRENCY = 200;
  if (concurrency > MAX_CONCURRENCY) {
    return `Concurrency cannot exceed ${MAX_CONCURRENCY}`;
  }

  return null;
};

const validateLimiter = (limiter: OptionsConfig['limiter']): string | null => {
  if (!limiter) {
    return 'Limiter configuration is required';
  }

  // Validate max
  if (limiter.max === undefined || limiter.max === null) {
    return 'Limiter max is required';
  }

  if (typeof limiter.max !== 'number') {
    return 'Limiter max must be a number';
  }

  if (!Number.isInteger(limiter.max)) {
    return 'Limiter max must be a whole number (integer)';
  }

  if (limiter.max < 1) {
    return 'Limiter max must be at least 1';
  }
  const MAX_LIMITER_MAX = 100000;
  if (limiter.max > MAX_LIMITER_MAX) {
    return `Limiter max cannot exceed ${MAX_LIMITER_MAX}`;
  }

  // Validate duration
  if (limiter.duration === undefined || limiter.duration === null) {
    return 'Limiter duration is required';
  }

  if (typeof limiter.duration !== 'number') {
    return 'Limiter duration must be a number';
  }

  if (!Number.isInteger(limiter.duration)) {
    return 'Limiter duration must be a whole number (integer)';
  }

  if (limiter.duration < 1000) {
    return 'Limiter duration must be at least 1000ms';
  }
  const MAX_LIMITER_DURATION = 24 * 60 * 60 * 1000; // 1 day
  if (limiter.duration > MAX_LIMITER_DURATION) {
    return `Limiter duration cannot exceed ${MAX_LIMITER_DURATION} ms`;
  }

  return null;
};

export const withOptionsValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const options = data['options'] as OptionsConfig;

      if (!options) {
        return res.setStatus(400).json({
          error: 'Options configuration is required',
          code: 'MISSING_OPTIONS',
        });
      }

      // Validate concurrency
      const concurrencyError = validateConcurrency(options.concurrency);
      if (concurrencyError) {
        return res.setStatus(400).json({
          error: 'Invalid concurrency',
          message: concurrencyError,
          code: 'INVALID_CONCURRENCY',
        });
      }

      // Validate limiter
      const limiterError = validateLimiter(options.limiter);
      if (limiterError) {
        return res.setStatus(400).json({
          error: 'Invalid limiter configuration',
          message: limiterError,
          code: 'INVALID_LIMITER_CONFIG',
        });
      }

      // Sanitize concurrency to ensure it's an integer
      const currentBody = req.getBody() as Record<string, unknown>;
      const sanitizedOptions = {
        ...options,
        concurrency: Math.floor(options.concurrency),
        limiter: {
          ...options.limiter,
          max: Math.floor(options.limiter.max),
          duration: Math.floor(options.limiter.duration),
        },
      };

      req.setBody({ ...currentBody, options: sanitizedOptions });

      return handler(req, res);
    } catch (error) {
      Logger.error('Options validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
