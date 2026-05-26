/**
 * Mail Exports
 * Provides mail drivers and notification utilities
 */

export { MailgunDriver } from '@tools/mail/drivers/Mailgun';
export { SendGridDriver } from '@tools/mail/drivers/SendGrid';
export { SmtpDriver as CoreSmtpDriver, SmtpDriver } from '@tools/mail/drivers/Smtp';
export { Notification } from '@tools/notification/Notification';

export type {
  MailgunMailDriverConfig as MailgunConfig,
  SendGridMailDriverConfig as SendGridConfig,
  SmtpMailDriverConfig as SmtpDriverConfig,
} from '@config/type';

export type {
  MailMessage as MailgunMessage,
  SendResult as MailgunResult,
} from '@tools/mail/drivers/Mailgun';
export type {
  MailAddress as SendGridMailAddress,
  MailAttachment as SendGridMailAttachment,
  MailMessage as SendGridMailMessage,
  SendResult as SendGridSendResult,
} from '@tools/mail/drivers/SendGrid';
