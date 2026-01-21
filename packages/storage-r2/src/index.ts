import { R2Driver as CoreR2Driver } from '@zintrust/core';

const R2Driver = CoreR2Driver;
export { R2Driver };
export type { R2Config } from '@zintrust/core';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_STORAGE_R2_VERSION = '0.1.15';
export const _ZINTRUST_STORAGE_R2_BUILD_DATE = '__BUILD_DATE__';
