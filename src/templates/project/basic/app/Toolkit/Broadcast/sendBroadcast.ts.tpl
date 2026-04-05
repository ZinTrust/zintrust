import { Broadcast } from '@zintrust/core';

/**
 * Compatibility wrapper for projects that want an app-local helper.
 * Prefer Broadcast.publish(...) directly in application code.
 */
export async function sendBroadcast(channel: string, event: string, data: unknown): Promise<void> {
  await Broadcast.publish({ channel, event, data });
}

export default Object.freeze({ sendBroadcast });
