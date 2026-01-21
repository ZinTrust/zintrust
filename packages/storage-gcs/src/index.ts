import { GcsDriver as CoreGcsDriver } from '@zintrust/core';

const GcsDriver = CoreGcsDriver;
export { GcsDriver };
export type { GcsConfig } from '@zintrust/core';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_STORAGE_GCS_VERSION = '0.1.15';
export const _ZINTRUST_STORAGE_GCS_BUILD_DATE = '__BUILD_DATE__';
