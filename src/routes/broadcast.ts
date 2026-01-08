/**
 * Broadcast Routes
 *
 * Runtime-only endpoints for broadcast.
 * Provider setup and secret provisioning remain CLI-only.
 */

import { type IRouter, Router } from '@routing/Router';

export function registerBroadcastRoutes(router: IRouter): void {
  Router.get(router, '/broadcast/health', (_req, res) => {
    res.json({ ok: true });
  });

  Router.post(router, '/broadcast/send', async (req: { body?: unknown }, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const channel = typeof body['channel'] === 'string' ? body['channel'] : '';
    const event = typeof body['event'] === 'string' ? body['event'] : '';
    const data = body['data'];

    if (!channel || !event) {
      res
        .setStatus(400)
        .json({ ok: false, error: 'Invalid payload: channel and event are required' });
      return;
    }

    const { Broadcast } = await import('@broadcast/Broadcast');
    const result = await Broadcast.send(channel, event, data);
    res.json({ ok: true, result });
  });
}
