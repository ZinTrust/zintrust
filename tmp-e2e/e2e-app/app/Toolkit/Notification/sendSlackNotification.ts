import { sendSlackWebhook } from '@zintrust/core';

export async function sendSlackNotification(
  webhookUrl: string,
  message: { text: string }
): Promise<void> {
  await sendSlackWebhook({ webhookUrl }, message);
}

export default Object.freeze({ sendSlackNotification });
