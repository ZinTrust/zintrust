/**
 * ZinTrust Tools - Mail integration
 * Contains mail drivers and mail-related utilities
 */

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
