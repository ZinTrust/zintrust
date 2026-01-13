/**
 * Startup Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `startupConfigObj`.
 */

import { startupConfig as coreStartupConfig } from '@zintrust/core';

export type StartupConfig = typeof coreStartupConfig;

export const startupConfigObj = {
  ...coreStartupConfig,
} satisfies StartupConfig;

export const startupConfig = startupConfigObj;
export default startupConfig;
