import type { IRequest, IResponse } from '@zintrust/core/http';
import { Logger } from '@zintrust/core/logger';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const VALID_FEATURES = new Set([
  'clustering',
  'metrics',
  'autoScaling',
  'circuitBreaker',
  'deadLetterQueue',
  'resourceMonitoring',
  'compliance',
  'observability',
  'plugins',
  'versioning',
  'datacenterOrchestration',
]);

export const withFeaturesValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const features = data['features'] as unknown;

      if (!features) {
        return handler(req, res); // Skip validation if features is not provided
      }

      const isPlainObject =
        Object.prototype.toString.call(features) === '[object Object]' && !Array.isArray(features);

      if (!isPlainObject) {
        return res.setStatus(400).json({
          error: 'Invalid features configuration',
          message: 'Features must be an object',
          code: 'INVALID_FEATURES_TYPE',
        });
      }

      // Validate each feature key and value
      const featuresObj = features as Record<string, unknown>;
      const featureKeys = Object.keys(featuresObj);
      for (const key of featureKeys) {
        if (!VALID_FEATURES.has(key)) {
          return res.setStatus(400).json({
            error: 'Invalid feature',
            message: `Unknown feature: ${key}. Valid features are: ${Array.from(VALID_FEATURES).join(', ')}`,
            code: 'INVALID_FEATURE',
          });
        }

        const value = featuresObj[key];
        if (typeof value !== 'boolean') {
          return res.setStatus(400).json({
            error: 'Invalid feature value',
            message: `Feature ${key} must be a boolean (true or false)`,
            code: 'INVALID_FEATURE_VALUE',
          });
        }
      }

      return handler(req, res);
    } catch (error) {
      Logger.error('Features validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
