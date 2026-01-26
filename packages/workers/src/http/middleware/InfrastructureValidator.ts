import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

const VALID_DRIVERS = new Set(['db', 'redis', 'memory']);
const VALID_DEAD_LETTER_POLICIES = new Set(['expire', 'retry', 'dead-letter']);

export interface InfrastructureConfig {
  persistence: {
    driver: string;
  };
  redis: {
    env: boolean;
    host: string;
    port: string;
    db: string;
    password: string;
  };
  deadLetterQueue: {
    policy: string;
  };
  compliance: {
    config: {
      retentionDays: number;
    };
  };
  observability: {
    enabled: boolean;
  };
  autoScaler: {
    enabled: boolean;
    minWorkers: number;
    maxWorkers: number;
  };
}

const validatePersistence = (persistence: InfrastructureConfig['persistence']): string | null => {
  if (!persistence) return 'Persistence configuration is required';

  // Validate persistence driver
  if (!persistence.driver) {
    return 'Persistence driver is required';
  }

  if (!VALID_DRIVERS.has(persistence.driver)) {
    return 'Persistence driver must be one of: db, redis, memory';
  }

  return null;
};

const validateRedis = (redis: InfrastructureConfig['redis']): string | null => {
  if (!redis) return 'Redis configuration is required';

  // Validate env flag
  if (typeof redis.env !== 'boolean') {
    return 'Redis env flag must be a boolean';
  }

  // Validate required fields when not using env
  if (!redis.env) {
    const requiredFieldsError = validateRequiredRedisFields(redis);
    if (requiredFieldsError) return requiredFieldsError;
  }

  // Validate string fields
  return validateRedisStringFields(redis);
};

const validateRequiredRedisFields = (redis: InfrastructureConfig['redis']): string | null => {
  if (!redis.host || typeof redis.host !== 'string') {
    return 'Redis host is required when env is false';
  }
  if (redis.port === undefined || redis.port === null) {
    return 'Redis port is required when env is false';
  }
  if (typeof redis.port !== 'string' && typeof redis.port !== 'number') {
    return 'Redis port must be a string or number';
  }
  if (!redis.db || typeof redis.db !== 'string') {
    return 'Redis db is required when env is false';
  }
  return null;
};

const validateRedisStringFields = (redis: InfrastructureConfig['redis']): string | null => {
  if (redis.host && typeof redis.host !== 'string') {
    return 'Redis host must be a string';
  }
  if (redis.port && typeof redis.port !== 'string' && typeof redis.port !== 'number') {
    return 'Redis port must be a string or number';
  }
  if (redis.db && typeof redis.db !== 'string') {
    return 'Redis db must be a string';
  }
  if (redis.password && typeof redis.password !== 'string') {
    return 'Redis password must be a string';
  }
  return null;
};

const validateDeadLetterQueue = (
  deadLetterQueue: InfrastructureConfig['deadLetterQueue']
): string | null => {
  if (!deadLetterQueue) return 'DeadLetterQueue configuration is required';

  // Validate policy
  if (!deadLetterQueue.policy) {
    return 'DeadLetterQueue policy is required';
  }

  if (!VALID_DEAD_LETTER_POLICIES.has(deadLetterQueue.policy)) {
    return 'Policy must be one of: expire, retry, dead-letter';
  }

  return null;
};

const validateCompliance = (compliance: InfrastructureConfig['compliance']): string | null => {
  if (!compliance) return 'Compliance configuration is required';

  if (!compliance.config) {
    return 'Compliance config is required';
  }

  if (typeof compliance.config.retentionDays !== 'number' || compliance.config.retentionDays < 0) {
    return 'Retention days must be a non-negative number';
  }
  const MAX_RETENTION_DAYS = 3650; // ~10 years
  if (compliance.config.retentionDays > MAX_RETENTION_DAYS) {
    return `Retention days cannot exceed ${MAX_RETENTION_DAYS}`;
  }

  return null;
};

const validateObservability = (
  observability: InfrastructureConfig['observability']
): string | null => {
  if (!observability) return 'Observability configuration is required';

  if (typeof observability.enabled !== 'boolean') {
    return 'Observability enabled flag must be a boolean';
  }

  return null;
};

const validateAutoScaler = (autoScaler: InfrastructureConfig['autoScaler']): string | null => {
  if (!autoScaler) return 'AutoScaler configuration is required';

  if (typeof autoScaler.enabled !== 'boolean') {
    return 'AutoScaler enabled flag must be a boolean';
  }

  if (autoScaler.enabled) {
    const minWorkersError = validateWorkerCount(autoScaler.minWorkers, 'minWorkers');
    if (minWorkersError) return minWorkersError;

    const maxWorkersError = validateWorkerCount(autoScaler.maxWorkers, 'maxWorkers');
    if (maxWorkersError) return maxWorkersError;

    if (autoScaler.minWorkers > autoScaler.maxWorkers) {
      return 'AutoScaler minWorkers cannot be greater than maxWorkers';
    }
    const MAX_AUTOSCALER_WORKERS = 1000;
    if (autoScaler.maxWorkers > MAX_AUTOSCALER_WORKERS) {
      return `AutoScaler maxWorkers cannot exceed ${MAX_AUTOSCALER_WORKERS}`;
    }
  }

  return null;
};

const validateWorkerCount = (value: number, fieldName: string): string | null => {
  if (typeof value !== 'number') {
    return `AutoScaler ${fieldName} must be a number`;
  }

  if (!Number.isInteger(value)) {
    return `AutoScaler ${fieldName} must be a whole number (integer)`;
  }

  if (value < 0) {
    return `AutoScaler ${fieldName} must be a non-negative number`;
  }

  return null;
};

const sanitizeInfrastructure = (infrastructure: InfrastructureConfig): InfrastructureConfig => {
  return {
    ...infrastructure,
    autoScaler: {
      ...infrastructure.autoScaler,
      minWorkers: Math.floor(infrastructure.autoScaler.minWorkers),
      maxWorkers: Math.floor(infrastructure.autoScaler.maxWorkers),
    },
  };
};

export const withInfrastructureValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const infrastructure = data['infrastructure'] as InfrastructureConfig;

      if (!infrastructure) {
        return res.setStatus(400).json({
          error: 'Infrastructure configuration is required',
          code: 'MISSING_INFRASTRUCTURE',
        });
      }

      // Validate persistence
      const persistenceError = validatePersistence(infrastructure.persistence);
      if (persistenceError) {
        return res.setStatus(400).json({
          error: 'Invalid persistence configuration',
          message: persistenceError,
          code: 'INVALID_PERSISTENCE_CONFIG',
        });
      }

      // Validate redis
      const redisError = validateRedis(infrastructure.redis);
      if (redisError) {
        return res.setStatus(400).json({
          error: 'Invalid redis configuration',
          message: redisError,
          code: 'INVALID_REDIS_CONFIG',
        });
      }

      // Validate deadLetterQueue
      const deadLetterQueueError = validateDeadLetterQueue(infrastructure.deadLetterQueue);
      if (deadLetterQueueError) {
        return res.setStatus(400).json({
          error: 'Invalid deadLetterQueue configuration',
          message: deadLetterQueueError,
          code: 'INVALID_DEAD_LETTER_QUEUE_CONFIG',
        });
      }

      // Validate compliance
      const complianceError = validateCompliance(infrastructure.compliance);
      if (complianceError) {
        return res.setStatus(400).json({
          error: 'Invalid compliance configuration',
          message: complianceError,
          code: 'INVALID_COMPLIANCE_CONFIG',
        });
      }

      // Validate observability
      const observabilityError = validateObservability(infrastructure.observability);
      if (observabilityError) {
        return res.setStatus(400).json({
          error: 'Invalid observability configuration',
          message: observabilityError,
          code: 'INVALID_OBSERVABILITY_CONFIG',
        });
      }

      // Validate autoScaler
      const autoScalerError = validateAutoScaler(infrastructure.autoScaler);
      if (autoScalerError) {
        return res.setStatus(400).json({
          error: 'Invalid autoScaler configuration',
          message: autoScalerError,
          code: 'INVALID_AUTO_SCALER_CONFIG',
        });
      }

      // Sanitize infrastructure values
      const currentBody = req.getBody() as Record<string, unknown>;
      const sanitizedInfrastructure = sanitizeInfrastructure(infrastructure);

      // Update the infrastructure in the request body
      const updatedBody = {
        ...currentBody,
        infrastructure: sanitizedInfrastructure,
      };
      req.setBody(updatedBody);

      return handler(req, res);
    } catch (error) {
      Logger.error('Infrastructure validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
