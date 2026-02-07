import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

// Import individual validators
import { withDatacenterValidation } from './DatacenterValidator';
import { withFeaturesValidation } from './FeaturesValidator';
import { withInfrastructureValidation } from './InfrastructureValidator';
import { withStrictPayloadKeys } from './PayloadSanitizer';
import { withProcessorPathValidation } from './ProcessorPathSanitizer';
import { withQueueNameValidation } from './QueueNameSanitizer';
import { withVersionValidation } from './VersionSanitizer';
import { withWorkerNameValidation } from './WorkerNameSanitizer';

/**
 * Composite middleware for worker edit validation
 * Maps processorPath to processor for validation and validates all editable fields
 */
export const withEditWorkerValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const currentBody = req.getBody() as Record<string, unknown>;

      // Map processorSpec/processorPath to processor for validation if provided
      let mappedBody = { ...currentBody };
      if (data['processorSpec'] && !data['processor']) {
        mappedBody = {
          ...mappedBody,
          processor: data['processorSpec'],
        };
      } else if (data['processorPath'] && !data['processor']) {
        mappedBody = {
          ...mappedBody,
          processor: data['processorPath'], // Map for validation
        };
      }

      // Update the request body with mapped fields
      req.setBody(mappedBody);

      // Apply validation with mapped fields, skipping options validation for editing
      return withStrictPayloadKeys(
        [
          'name',
          'queueName',
          'processor', // Validated field (mapped from processorPath)
          'processorPath', // Original field
          'processorSpec',
          'version',
          'options', // Skip strict validation for editing
          'infrastructure',
          'features',
          'datacenter',
          'concurrency', // Original field
          'region',
          'autoStart',
          'activeStatus',
          'status',
        ],
        withProcessorPathValidation(
          withWorkerNameValidation(
            withQueueNameValidation(
              withVersionValidation(
                withInfrastructureValidation(
                  withFeaturesValidation(withDatacenterValidation(handler))
                )
              )
            )
          )
        )
      )(req, res);
    } catch (error) {
      Logger.error('Edit worker validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
