import { Mail } from '@zintrust/core';

export async function sendWelcomeEmail(
  to: string,
  name: string,
  attachmentDisk?: string,
  attachmentPath?: string
): Promise<void> {
  const subject = `Welcome, ${name}`;
  const text = `Hello ${name}, welcome.`;

  const attachments =
    attachmentDisk !== null &&
    attachmentDisk !== undefined &&
    attachmentDisk.trim() !== '' &&
    attachmentPath !== null &&
    attachmentPath !== undefined &&
    attachmentPath.trim() !== ''
      ? [{ disk: attachmentDisk, path: attachmentPath }]
      : undefined;

  await Mail.send({
    to,
    subject,
    text,
    attachments,
  });
}

export default Object.freeze({ sendWelcomeEmail });
