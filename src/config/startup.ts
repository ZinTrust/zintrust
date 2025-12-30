/**
 * Startup Configuration
 *
 * Startup-only controls (evaluated during Application.boot()).
 */

import { Env } from '@config/env';

export type StartupConfig = {
  healthChecksEnabled: boolean;
  validateSecrets: boolean;
  checkDatabase: boolean;
  checkCache: boolean;
  timeoutMs: number;
  continueOnFailure: boolean;
};

export const startupConfig = Object.freeze({
  healthChecksEnabled: Env.getBool('STARTUP_HEALTH_CHECKS', true),
  validateSecrets: Env.getBool('STARTUP_VALIDATE_SECRETS', true),
  checkDatabase: Env.getBool('STARTUP_CHECK_DB', false),
  checkCache: Env.getBool('STARTUP_CHECK_CACHE', false),
  timeoutMs: Env.getInt('STARTUP_HEALTH_TIMEOUT_MS', 2500),
  continueOnFailure: Env.getBool('STARTUP_CONTINUE_ON_FAILURE', false),
} satisfies StartupConfig);

export default startupConfig;
