import { SendGridDriver as CoreSendGridDriver } from '@zintrust/core';

const SendGridDriver = CoreSendGridDriver;
export { SendGridDriver };
export type {
  SendGridConfig,
  SendGridMailAddress,
  SendGridMailAttachment,
  SendGridMailMessage,
  SendGridSendResult,
} from '@zintrust/core';
