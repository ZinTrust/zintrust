import { Env } from '@config/env';
import { Logger } from '@config/logger';

/**
 * Feature Flags State
 * Internal state managed by the module
 */
let _rawQueryEnabled = false;

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
   * Reset flags (primarily for testing)
   */
  reset(): void {
    _rawQueryEnabled = false;
  },

  /**
   * Set raw query enabled state
   * Primarily for testing to avoid 'as any' type casting
   */
  setRawQueryEnabled(enabled: boolean): void {
    _rawQueryEnabled = enabled;
  },
});

export default FeatureFlags;
