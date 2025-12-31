import { sendSms } from '@zintrust/core';

export async function sendSmsNotification(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<void> {
  await sendSms({ accountSid, authToken, from }, { to, body });
}

export default Object.freeze({ sendSmsNotification });
