import { Broadcast } from '@broadcast/Broadcast';

export async function sendBroadcast(channel: string, event: string, data: unknown): Promise<void> {
  await Broadcast.send(channel, event, data);
}

export default Object.freeze({ sendBroadcast });
