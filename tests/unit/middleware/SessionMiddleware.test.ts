import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { SessionMiddleware } from '@middleware/SessionMiddleware';

vi.mock('@/common/utility', () => ({
  generateSecureJobId: vi.fn(async () => 'secure-session-id'),
}));

describe('SessionMiddleware', () => {
  let req: IRequest;
  let res: IResponse;
  let next: () => Promise<void>;
  let headers: Record<string, string | string[]>;
  let locals: Record<string, any>;

  beforeEach(() => {
    headers = {};
    locals = {};

    req = {
      getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
      context: {},
      sessionId: undefined,
    } as unknown as IRequest;

    res = {
      setHeader: vi.fn((name: string, value: string | string[]) => {
        headers[name.toLowerCase()] = value;
        return res;
      }),
      getHeader: vi.fn((name: string) => headers[name.toLowerCase()]),
      locals,
    } as unknown as IResponse;

    next = vi.fn().mockResolvedValue(undefined);
  });

  it('creates a session id and sets ZIN_SESSION_ID cookie', async () => {
    const middleware = SessionMiddleware.create();

    await middleware(req, res, next);

    expect(req.context['sessionId']).toBe('secure-session-id');
    expect(req.sessionId).toBe('secure-session-id');
    expect(res.locals['sessionId']).toBe('secure-session-id');

    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('ZIN_SESSION_ID=secure-session-id')
    );

    expect(next).toHaveBeenCalled();
  });

  it('appends Set-Cookie when one already exists', async () => {
    headers['set-cookie'] = 'XSRF-TOKEN=csrf-token; Path=/; SameSite=Strict';

    const middleware = SessionMiddleware.create();
    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'XSRF-TOKEN=csrf-token; Path=/; SameSite=Strict',
      expect.stringContaining('ZIN_SESSION_ID=secure-session-id'),
    ]);
  });

  it('does not re-set cookie when session cookie already exists', async () => {
    headers['cookie'] = 'ZIN_SESSION_ID=existing; other=1';

    const middleware = SessionMiddleware.create();
    await middleware(req, res, next);

    expect(req.context['sessionId']).toBe('existing');
    expect(req.sessionId).toBe('existing');

    // setHeader may still be called by other middleware; here we only check it wasn't used for session.
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('ZIN_SESSION_ID=')
    );
  });
});
