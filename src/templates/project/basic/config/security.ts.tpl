/**
 * Security Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `securityConfigObj`.
 */

import { securityConfig as coreSecurityConfig } from '@zintrust/core';

type SecurityConfigShape = typeof coreSecurityConfig;

export const securityConfigObj = {
  ...coreSecurityConfig,
} satisfies SecurityConfigShape;

const securityConfig = securityConfigObj;
export default securityConfig;
