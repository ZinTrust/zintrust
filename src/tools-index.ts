/**
 * ZinTrust Tools - Non-runtime entrypoint
 * Contains all service integrations and optional drivers
 */

// Mail
export { Mail } from '@tools/mail';
export type { SendMailInput, SendMailResult } from '@/tools/mail';
export { MailTemplateRenderer, MailTemplates } from '@mail/templates';
export type { MailTemplate, MailTemplateRegistry } from '@mail/templates';
export { MailDriverRegistry } from '@mail/MailDriverRegistry';
export { registerQueuesFromRuntimeConfig } from '@tools/queue/QueueRuntimeRegistration';
export { SmtpDriver } from '@mail/drivers/Smtp';
export type { SmtpConfig as SmtpDriverConfig } from '@mail/drivers/Smtp';
export { SendGridDriver } from '@mail/drivers/SendGrid';
export type {
  SendGridConfig,
  MailAddress as SendGridMailAddress,
  MailAttachment as SendGridMailAttachment,
  MailMessage as SendGridMailMessage,
  SendResult as SendGridSendResult,
} from '@mail/drivers/SendGrid';
export { MailgunDriver } from '@mail/drivers/Mailgun';
export type {
  MailgunConfig,
  MailMessage as MailgunMessage,
  SendResult as MailgunResult,
} from '@mail/drivers/Mailgun';

// Notification
export { NotificationComposer } from '@tools/notification/Composer';
export type {
  NotificationChannelHandler,
  NotificationComposeBuilder,
  NotificationComposeChannelResult,
  NotificationComposeError,
  NotificationComposeOptions,
  NotificationComposePolicy,
  NotificationComposeResult,
} from '@tools/notification/Composer';
export { sendSlackWebhook } from '@tools/notification/drivers/Slack';
export { TermiiDriver } from '@tools/notification/drivers/Termii';
export { sendSms } from '@tools/notification/drivers/Twilio';
export { Notification } from '@tools/notification/Notification';
export { NotificationRegistry } from '@tools/notification/Registry';

// Storage
export { Storage } from '@tools/storage/index';
export { LocalSignedUrl } from '@tools/storage/LocalSignedUrl';
export { StorageDriverRegistry } from '@tools/storage/StorageDriverRegistry';
export { S3Driver } from '@tools/storage/drivers/S3';
export type { S3Config } from '@tools/storage/drivers/S3';
export { R2Driver } from '@tools/storage/drivers/R2';
export type { R2Config } from '@tools/storage/drivers/R2';
export { GcsDriver } from '@tools/storage/drivers/Gcs';
export type { GcsConfig } from '@tools/storage/drivers/Gcs';

// Queue
export { resolveDeduplicationLockKey } from '@queue/DeduplicationKey';
export { RedisQueue } from '@queue/drivers/Redis';
export { IdempotencyManager } from '@queue/IdempotencyManager';
export { JobHeartbeatStore } from '@queue/JobHeartbeatStore';
export { JobReconciliationRunner } from '@queue/JobReconciliationRunner';
export { JobRecoveryDaemon } from '@queue/JobRecoveryDaemon';
export { JobStateTracker } from '@queue/JobStateTracker';
export {
  autoRegisterJobStateTrackerPersistenceFromEnv,
  createJobStateTrackerDbPersistence,
} from '@queue/JobStateTrackerDbPersistence';
export { createLockProvider, getLockProvider, registerLockProvider } from '@queue/LockProvider';
export { Queue, resolveLockPrefix } from '@queue/Queue';
export type { BullMQPayload, IQueueDriver, QueueMessage } from '@queue/Queue';
export { QueueDataRedactor } from '@queue/QueueDataRedactor';
export { QueueReliabilityMetrics } from '@queue/QueueReliabilityMetrics';
export { QueueReliabilityOrchestrator } from '@queue/QueueReliabilityOrchestrator';
export { QueueTracing } from '@queue/QueueTracing';
export { StalledJobMonitor } from '@queue/StalledJobMonitor';
export { TimeoutManager } from '@queue/TimeoutManager';

// Broadcast
export { Broadcast } from '@tools/broadcast/Broadcast';
export type { BroadcastPublishInput, BroadcastPublishResult } from '@tools/broadcast/Broadcast';
export { BroadcastRegistry } from '@tools/broadcast/BroadcastRegistry';
export { registerBroadcastersFromRuntimeConfig } from '@tools/broadcast/BroadcastRuntimeRegistration';

// HTTP client helpers
export { HttpClient } from '@httpClient/Http';
export type { IHttpRequest, IHttpResponse } from '@httpClient/Http';
