/**
 * Microservices Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `microservicesConfigObj`.
 */

import { microservicesConfig as coreMicroservicesConfig } from '@zintrust/core';

type MicroservicesConfigShape = typeof coreMicroservicesConfig;

export const microservicesConfigObj = {
  ...coreMicroservicesConfig,
} satisfies MicroservicesConfigShape;

export const microservicesConfig = microservicesConfigObj;
export type MicroservicesConfig = typeof microservicesConfig;
