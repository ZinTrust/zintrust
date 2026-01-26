import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

interface DatacenterConfig {
  primaryRegion: string;
  secondaryRegions: string[];
  affinityRules: {
    preferLocal: boolean;
    maxLatency: number;
    avoidRegions: string[];
  };
}

const validateRegion = (region: string): boolean => {
  // Allow custom region names but validate format
  return /^[a-z0-9-]+$/.test(region) && region.length >= 3 && region.length <= 20;
};

const validatePrimaryRegion = (primaryRegion: string): string | null => {
  if (!primaryRegion) {
    return 'Primary region is required';
  }

  if (!validateRegion(primaryRegion)) {
    return 'Primary region must be 3-20 characters, lowercase letters, numbers, and hyphens only';
  }

  return null;
};

const validateSecondaryRegions = (secondaryRegions: string[]): string | null => {
  if (!Array.isArray(secondaryRegions)) {
    return 'Secondary regions must be an array';
  }

  for (const region of secondaryRegions) {
    if (!validateRegion(region)) {
      return `Secondary region '${region}' must be 3-20 characters, lowercase letters, numbers, and hyphens only`;
    }
  }

  return null;
};

const validateAffinityRules = (affinityRules: DatacenterConfig['affinityRules']): string | null => {
  if (!affinityRules) {
    return 'Affinity rules are required';
  }

  if (typeof affinityRules.preferLocal !== 'boolean') {
    return 'Affinity rule preferLocal must be a boolean';
  }

  if (typeof affinityRules.maxLatency !== 'number' || affinityRules.maxLatency < 0) {
    return 'Affinity rule maxLatency must be a non-negative number';
  }

  if (!Array.isArray(affinityRules.avoidRegions)) {
    return 'Affinity rule avoidRegions must be an array';
  }

  for (const region of affinityRules.avoidRegions) {
    if (!validateRegion(region)) {
      return `Avoid region '${region}' must be 3-20 characters, lowercase letters, numbers, and hyphens only`;
    }
  }

  return null;
};

export const withDatacenterValidation = (handler: RouteHandler): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const data = req.data();
      const datacenter = data['datacenter'] as DatacenterConfig;

      if (!datacenter) {
        return res.setStatus(400).json({
          error: 'Datacenter configuration is required',
          code: 'MISSING_DATACENTER',
        });
      }

      // Validate primary region
      const primaryRegionError = validatePrimaryRegion(datacenter.primaryRegion);
      if (primaryRegionError) {
        return res.setStatus(400).json({
          error: 'Invalid primary region',
          message: primaryRegionError,
          code: 'INVALID_PRIMARY_REGION',
        });
      }

      // Validate secondary regions
      const secondaryRegionsError = validateSecondaryRegions(datacenter.secondaryRegions);
      if (secondaryRegionsError) {
        return res.setStatus(400).json({
          error: 'Invalid secondary regions',
          message: secondaryRegionsError,
          code: 'INVALID_SECONDARY_REGIONS',
        });
      }

      // Validate affinity rules
      const affinityRulesError = validateAffinityRules(datacenter.affinityRules);
      if (affinityRulesError) {
        return res.setStatus(400).json({
          error: 'Invalid affinity rules',
          message: affinityRulesError,
          code: 'INVALID_AFFINITY_RULES',
        });
      }

      return handler(req, res);
    } catch (error) {
      Logger.error('Datacenter validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};
