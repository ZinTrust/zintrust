import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { D1ReadConstraint } from '@orm/DatabaseAdapter';

/**
 * Feature Flags State
 * Internal state managed by the module
 */
let _rawQueryEnabled = false;

const D1_READ_DEFAULT_CONSTRAINT: D1ReadConstraint = 'first-unconstrained';
let _d1ReadReplicationEnabled = false;
let _d1ReadDefaultConstraint: D1ReadConstraint = D1_READ_DEFAULT_CONSTRAINT;

const normalizeReadConstraint = (raw: string): D1ReadConstraint => {
  const value = raw.trim().toLowerCase();
  return value === 'first-primary' ? 'first-primary' : 'first-unconstrained';
};

/**
 * Feature Flags - Controls access to advanced/experimental features
 * Sealed namespace for immutability
 */
export const FeatureFlags = Object.freeze({
  /**
   * Initialize all feature flags from environment
   * Called once during application bootstrap
   */
  initialize(): void {
    _rawQueryEnabled = Env.get('USE_RAW_QRY') === 'true';

    _d1ReadReplicationEnabled = Env.getBool('D1_READ_REPLICATION', false);
    _d1ReadDefaultConstraint = normalizeReadConstraint(
      Env.get('D1_READ_DEFAULT_CONSTRAINT', D1_READ_DEFAULT_CONSTRAINT)
    );

    if (_d1ReadReplicationEnabled) {
      Logger.info(
        `✓ D1 read replication ENABLED (default constraint: ${_d1ReadDefaultConstraint})`
      );
    }

    if (_rawQueryEnabled) {
      Logger.warn(
        '⚠️  FEATURE FLAG ENABLED: Raw SQL Queries are now available via adapter.rawQuery()'
      );
      Logger.warn('⚠️  This bypasses QueryBuilder safety - use only when necessary');
      Logger.warn('⚠️  Ensure parameters are properly bound to prevent SQL injection');
    } else {
      Logger.info('🔒 Raw SQL Queries are DISABLED (default, recommended for production)');
    }
  },

  /**
   * Check if raw queries are enabled
   * Returns cached flag value (no environment lookup)
   */
  isRawQueryEnabled(): boolean {
    return _rawQueryEnabled;
  },

  /**
   * Whether D1 read replication (Sessions API) is enabled. When off,
   * `IDatabase.withReadSession` is a passthrough and reads hit the primary.
   */
  isD1ReadReplicationEnabled(): boolean {
    return _d1ReadReplicationEnabled;
  },

  /**
   * Default session constraint applied by `withReadSession` when the caller
   * does not specify one.
   */
  getD1ReadDefaultConstraint(): D1ReadConstraint {
    return _d1ReadDefaultConstraint;
  },

  /**
   * Reset flags (primarily for testing)
   */
  reset(): void {
    _rawQueryEnabled = false;
    _d1ReadReplicationEnabled = false;
    _d1ReadDefaultConstraint = D1_READ_DEFAULT_CONSTRAINT;
  },

  /**
   * Set raw query enabled state
   * Primarily for testing to avoid 'as any' type casting
   */
  setRawQueryEnabled(enabled: boolean): void {
    _rawQueryEnabled = enabled;
  },

  /**
   * Set D1 read replication enabled state (primarily for testing).
   */
  setD1ReadReplicationEnabled(enabled: boolean): void {
    _d1ReadReplicationEnabled = enabled;
  },

  /**
   * Set the default D1 read constraint (primarily for testing).
   */
  setD1ReadDefaultConstraint(constraint: D1ReadConstraint): void {
    _d1ReadDefaultConstraint = constraint;
  },
});

export default FeatureFlags;
