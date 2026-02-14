import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

// Import individual validators
import { withDatacenterValidation } from './DatacenterValidator';
import { withFeaturesValidation } from './FeaturesValidator';
import { withInfrastructureValidation } from './InfrastructureValidator';
import { withOptionsValidation } from './OptionsValidator';
import { withStrictPayloadKeys } from './PayloadSanitizer';
import { withProcessorPathValidation } from './ProcessorPathSanitizer';
import { withQueueNameValidation } from './QueueNameSanitizer';
import { withVersionValidation } from './VersionSanitizer';
import { withWorkerNameValidation } from './WorkerNameSanitizer';

/**
 * Composite middleware for worker creation validation
 * Validates all required fields for creating a new worker
 */
export const withCreateWorkerValidation = (handler: RouteHandler): RouteHandler => {
  return withStrictPayloadKeys(
    [
      'name',
      'queueName',
      'processor',
      'version',
      'options',
      'infrastructure',
      'features',
      'datacenter',
      'activeStatus',
    ],
    withProcessorPathValidation(
      withWorkerNameValidation(
        withQueueNameValidation(
          withVersionValidation(
            withOptionsValidation(
              withInfrastructureValidation(
                withFeaturesValidation(withDatacenterValidation(handler))
              )
            )
          )
        )
      )
    )
  );
};

/**
 * Composite middleware for worker update validation
 * Validates optional fields for updating an existing worker
 */
export const withUpdateWorkerValidation = (handler: RouteHandler): RouteHandler => {
  return withVersionValidation(
    withInfrastructureValidation(withFeaturesValidation(withDatacenterValidation(handler)))
  );
};

/**
 * Composite middleware for worker operation validation
 * Validates worker name for operations like start, stop, restart, etc.
 */
export const withWorkerOperationValidation = (handler: RouteHandler): RouteHandler => {
  return withWorkerNameValidation(handler);
};

/**
 * Composite middleware for bulk operations validation
 * Validates arrays of worker names and operation parameters
 */
export const withBulkOperationValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const workerNames = data['workerNames'] as string[] | string;

      // Handle single worker name or array of names
      const names = Array.isArray(workerNames) ? workerNames : [workerNames];

      // Prevent enormous bulk operations
      const MAX_BULK_NAMES = 1000;
      if (names.length > MAX_BULK_NAMES) {
        return res.setStatus(413).json({
          error: 'Too many worker names',
          message: `Bulk operation exceeds maximum allowed names (${MAX_BULK_NAMES})`,
          code: 'BULK_OPERATION_TOO_LARGE',
        });
      }

      if (!names || names.length === 0) {
        return res.setStatus(400).json({
          error: 'Worker names are required',
          message: 'At least one worker name must be provided',
          code: 'MISSING_WORKER_NAMES',
        });
      }

      // Validate each worker name
      const WORKER_NAME_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/;
      for (const name of names) {
        if (!name || typeof name !== 'string') {
          return res.setStatus(400).json({
            error: 'Invalid worker name',
            message: 'Worker name must be a string',
            code: 'INVALID_WORKER_NAME_TYPE',
          });
        }

        if (!WORKER_NAME_PATTERN.test(name)) {
          return res.setStatus(400).json({
            error: 'Invalid worker name',
            message: `Worker name "${name}" must be 3-50 characters long and contain only letters, numbers, hyphens, and underscores`,
            code: 'INVALID_WORKER_NAME',
          });
        }
      }

      // Sanitize worker names
      const sanitizedNames = names
        .map((name) =>
          name
            .trim()
            .replaceAll(/[^a-zA-Z0-9_-]/g, '')
            .substring(0, 50)
        )
        .filter((name) => name.length >= 3);

      if (sanitizedNames.length === 0) {
        return res.setStatus(400).json({
          error: 'No valid worker names after sanitization',
          message: 'All worker names were invalid after sanitization',
          code: 'NO_VALID_WORKER_NAMES',
        });
      }

      // Update request data with sanitized names
      const currentBody = req.getBody() as Record<string, unknown>;
      req.setBody({ ...currentBody, workerNames: sanitizedNames });

      return handler(req, res);
    } catch (error) {
      Logger.error('Bulk operation validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

/**
 * Composite middleware for canary deployment validation
 * Validates canary-specific parameters
 */
export const withCanaryDeploymentValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const newVersion = data['newVersion'] as string;
      const initialTrafficPercent = data['initialTrafficPercent'] as number;
      const targetTrafficPercent = data['targetTrafficPercent'] as number;

      // Validate new version
      if (!newVersion) {
        return res.setStatus(400).json({
          error: 'New version is required',
          code: 'MISSING_NEW_VERSION',
        });
      }

      const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
      if (!VERSION_PATTERN.test(newVersion)) {
        return res.setStatus(400).json({
          error: 'Invalid version format',
          message: 'Version must follow semantic versioning (e.g., 1.0.0)',
          code: 'INVALID_VERSION_FORMAT',
        });
      }

      // Validate initial traffic percent
      if (initialTrafficPercent !== undefined) {
        if (
          typeof initialTrafficPercent !== 'number' ||
          initialTrafficPercent < 0 ||
          initialTrafficPercent > 100
        ) {
          return res.setStatus(400).json({
            error: 'Invalid initial traffic percent',
            message: 'Initial traffic percent must be a number between 0 and 100',
            code: 'INVALID_INITIAL_TRAFFIC_PERCENT',
          });
        }
      }

      // Validate target traffic percent
      if (targetTrafficPercent !== undefined) {
        if (
          typeof targetTrafficPercent !== 'number' ||
          targetTrafficPercent < 0 ||
          targetTrafficPercent > 100
        ) {
          return res.setStatus(400).json({
            error: 'Invalid target traffic percent',
            message: 'Target traffic percent must be a number between 0 and 100',
            code: 'INVALID_TARGET_TRAFFIC_PERCENT',
          });
        }
      }

      // Validate traffic progression
      if (initialTrafficPercent !== undefined && targetTrafficPercent !== undefined) {
        if (targetTrafficPercent < initialTrafficPercent) {
          return res.setStatus(400).json({
            error: 'Invalid traffic progression',
            message:
              'Target traffic percent must be greater than or equal to initial traffic percent',
            code: 'INVALID_TRAFFIC_PROGRESSION',
          });
        }
      }

      return handler(req, res);
    } catch (error) {
      Logger.error('Canary deployment validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
