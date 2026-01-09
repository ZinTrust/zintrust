/**
 * Mail Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `drivers` and `mailConfigObj`.
 */

import { mailConfig as coreMailConfig } from '@zintrust/core';

type MailConfigShape = typeof coreMailConfig;

export const drivers = {
  ...coreMailConfig.drivers,
} satisfies MailConfigShape['drivers'];

export const mailConfigObj = {
  ...coreMailConfig,
  drivers,
} satisfies MailConfigShape;

export const mailConfig = mailConfigObj;
export type MailConfig = typeof mailConfig;
