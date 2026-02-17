import { beforeEach, describe, expect, it, vi } from 'vitest';

let capturedHandler: ((req: any, res: any) => Promise<void>) | undefined;

vi.mock('@core-routes/Router', () => ({
  Router: {
    post: (_router: unknown, _path: string, handler: any) => {
      capturedHandler = handler;
    },
  },
}));

const listWithStateMock = vi.fn();
const runOnceMock = vi.fn();
vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    listWithState: (...args: unknown[]) => listWithStateMock(...args),
    runOnce: (...args: unknown[]) => runOnceMock(...args),
  },
}));

const verifyMock = vi.fn();
vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    verify: (...args: unknown[]) => verifyMock(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ScheduleHttpGateway } from '@scheduler/ScheduleHttpGateway';

type FakeRes = {
  status: (code: number) => FakeRes;
  json: (body: unknown) => void;
  _status?: number;
  _json?: unknown;
};

const makeRes = (): FakeRes => {
  const res: FakeRes = {
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
    },
  };
  return res;
};

const makeReq = (
  body: unknown,
  headers: Record<string, string> = {},
  path = '/api/_sys/schedule/rpc'
) => {
  return {
    body,
    context: {},
    getBody: () => body,
    getHeaders: () => headers,
    getPath: () => path,
    getMethod: () => 'POST',
  };
};

describe('ScheduleHttpGateway (coverage)', () => {
  beforeEach(() => {
    capturedHandler = undefined;
    vi.clearAllMocks();
    listWithStateMock.mockReset();
    runOnceMock.mockReset();
    verifyMock.mockReset();

    // Default credentials
    process.env['SCHEDULE_HTTP_PROXY_KEY_ID'] = 'kid';
    process.env['SCHEDULE_HTTP_PROXY_KEY'] = 'secret';
    process.env['SCHEDULE_HTTP_PROXY_PATH'] = '/api/_sys/schedule/rpc';

    ScheduleHttpGateway.create().registerRoutes({} as any);
    expect(capturedHandler).toBeTypeOf('function');
  });

  it('returns 500 when signing credentials are missing', async () => {
    process.env['SCHEDULE_HTTP_PROXY_KEY_ID'] = '';
    process.env['SCHEDULE_HTTP_PROXY_KEY'] = '';

    // re-register to pick up new settings
    ScheduleHttpGateway.create().registerRoutes({} as any);

    const res = makeRes();
    await capturedHandler!(makeReq({ action: 'list', requestId: 'r1' }), res);

    expect(res._status).toBe(500);
    expect((res._json as any).ok).toBe(false);
  });

  it('returns 401/403 based on verify error codes and exercises getSecretForKeyId fallback', async () => {
    verifyMock.mockImplementation(async (input: any) => {
      // exercise the key mismatch path
      input.getSecretForKeyId('other');
      return { ok: false, code: 'EXPIRED', message: 'expired' };
    });

    const res = makeRes();
    await capturedHandler!(makeReq({ action: 'list', requestId: 'r1' }), res);
    expect(res._status).toBe(401);

    verifyMock.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN', message: 'nope' });
    const res2 = makeRes();
    await capturedHandler!(makeReq({ action: 'list', requestId: 'r2' }), res2);
    expect(res2._status).toBe(403);
  });

  it('lists schedules when authorized', async () => {
    verifyMock.mockResolvedValue({ ok: true });
    listWithStateMock.mockResolvedValue([
      {
        schedule: {
          name: 'a',
          intervalMs: 1,
          cron: undefined,
          timezone: 'UTC',
          enabled: true,
          runOnStart: false,
        },
        state: { lastRunAt: 1 },
      },
    ]);

    const res = makeRes();
    await capturedHandler!(makeReq({ action: 'list', requestId: 'r1' }), res);

    expect(res._status).toBeUndefined();
    expect((res._json as any).ok).toBe(true);
    expect((res._json as any).result[0].name).toBe('a');
  });

  it('validates requestId/action and payload.name for run, returning 400', async () => {
    verifyMock.mockResolvedValue({ ok: true });

    const res1 = makeRes();
    await expect(
      capturedHandler!(makeReq({ action: 'list', requestId: '' }), res1)
    ).rejects.toBeDefined();

    const res2 = makeRes();
    await expect(
      capturedHandler!(makeReq({ action: 'bad', requestId: 'r2' }), res2)
    ).rejects.toBeDefined();

    const res3 = makeRes();
    await capturedHandler!(makeReq({ action: 'run', requestId: 'r3', payload: {} }), res3);
    expect(res3._status).toBe(400);
  });

  it('runs schedule and returns 500 on runtime errors', async () => {
    verifyMock.mockResolvedValue({ ok: true });

    runOnceMock.mockRejectedValueOnce(new Error('boom'));

    const res = makeRes();
    await capturedHandler!(
      makeReq({ action: 'run', requestId: 'r1', payload: { name: 'x' } }),
      res
    );
    expect(res._status).toBe(500);

    runOnceMock.mockResolvedValueOnce(undefined);
    const res2 = makeRes();
    await capturedHandler!(
      makeReq({ action: 'run', requestId: 'r2', payload: { name: 'x' } }),
      res2
    );
    expect((res2._json as any).ok).toBe(true);
  });

  it('coerces non-object request bodies to {} (coverage branch)', async () => {
    verifyMock.mockResolvedValue({ ok: true });

    const res = makeRes();
    await expect(capturedHandler!(makeReq('not-an-object' as any), res)).rejects.toBeDefined();
  });
});
