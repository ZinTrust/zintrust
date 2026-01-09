/**
 * Secrets Manager (template)
 *
 * Keep this file declarative:
 * - Core owns runtime secrets logic.
 */

export {
  SECRETS,
  SecretsManager,
  getDatabaseCredentials,
  getJwtSecrets,
} from '@zintrust/core';
export type { DatabaseCredentials, JwtSecrets } from '@zintrust/core';
