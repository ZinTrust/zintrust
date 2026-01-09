/**
 * Application Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `appConfigObj`.
 */

import { appConfig as coreAppConfig } from '@zintrust/core';

type AppConfigShape = typeof coreAppConfig;

export const appConfigObj = {
  ...coreAppConfig,
} satisfies AppConfigShape;

export const appConfig = appConfigObj;

// Keep the template API stable
export const getSafeEnv = appConfig.getSafeEnv;

export type AppConfig = typeof appConfig;
