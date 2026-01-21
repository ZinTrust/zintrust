import { S3Driver as CoreS3Driver } from '@zintrust/core';

const S3Driver = CoreS3Driver;
export { S3Driver };
export type { S3Config } from '@zintrust/core';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_STORAGE_S3_VERSION = '0.1.15';
export const _ZINTRUST_STORAGE_S3_BUILD_DATE = '__BUILD_DATE__';
