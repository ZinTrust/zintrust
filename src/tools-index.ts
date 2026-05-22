/**
 * ZinTrust Tools - Non-runtime entrypoint
 * Contains all service integrations and optional drivers
 */

// Mail
export * from '@zintrust/core/tools/mail';

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
export { GcsDriver } from '@tools/storage/drivers/Gcs';
export type { GcsConfig } from '@tools/storage/drivers/Gcs';
export { R2Driver } from '@tools/storage/drivers/R2';
export type { R2Config } from '@tools/storage/drivers/R2';
export { S3Driver } from '@tools/storage/drivers/S3';
export type { S3Config } from '@tools/storage/drivers/S3';
export { Storage } from '@tools/storage/index';
export { LocalSignedUrl } from '@tools/storage/LocalSignedUrl';
export { StorageDriverRegistry } from '@tools/storage/StorageDriverRegistry';

// Queue
export * from '@zintrust/core/tools/queue';

// Broadcast
export { Broadcast } from '@tools/broadcast/Broadcast';
export type { BroadcastPublishInput, BroadcastPublishResult } from '@tools/broadcast/Broadcast';
export { BroadcastRegistry } from '@tools/broadcast/BroadcastRegistry';
export { registerBroadcastersFromRuntimeConfig } from '@tools/broadcast/BroadcastRuntimeRegistration';

// HTTP client helpers
export { HttpClient } from '@httpClient/Http';
export type { IHttpRequest, IHttpResponse } from '@httpClient/Http';
