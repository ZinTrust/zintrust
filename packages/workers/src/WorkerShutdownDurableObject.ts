import { Logger } from '@zintrust/core';

type DurableObjectState = {
  storage: {
    get: (key: string) => Promise<unknown>;
    put: (key: string, value: unknown) => Promise<void>;
  };
};

type ShutdownState = {
  shuttingDown: boolean;
  startedAt?: string;
  reason?: string;
};

const loadState = async (state: DurableObjectState): Promise<ShutdownState> => {
  const stored = (await state.storage.get('shutdown')) as ShutdownState | undefined;
  return stored ?? { shuttingDown: false };
};

const saveState = async (state: DurableObjectState, value: ShutdownState): Promise<void> => {
  await state.storage.put('shutdown', value);
};

class WorkerShutdownDurableObjectBase {
  protected readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }
}

export class WorkerShutdownDurableObject extends WorkerShutdownDurableObjectBase {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/status') {
      const current = await loadState(this.state);
      return new Response(JSON.stringify(current), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (request.method === 'POST' && path === '/shutdown') {
      const payload = (await request.json().catch(() => ({}))) as { reason?: string };
      const next: ShutdownState = {
        shuttingDown: true,
        startedAt: new Date().toISOString(),
        reason: payload.reason ?? 'manual',
      };

      await saveState(this.state, next);
      Logger.info('Worker shutdown requested via Durable Object', next);

      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }
}
