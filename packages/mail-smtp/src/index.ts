import { SmtpDriver as CoreSmtpDriver } from '@zintrust/core';

const SmtpDriver = CoreSmtpDriver;
export { SmtpDriver };
export type { SmtpDriverConfig } from '@zintrust/core';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_MAIL_SMTP_VERSION = '0.1.15';
export const _ZINTRUST_MAIL_SMTP_BUILD_DATE = '__BUILD_DATE__';
