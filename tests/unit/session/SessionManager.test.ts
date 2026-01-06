import { SessionManager } from '@session/SessionManager';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@common/uuid', () => ({
  generateSecureJobId: vi.fn(() => 'generated-session-id'),
}));

describe('SessionManager', () => {
  it('getIdFromCookieHeader parses cookie value', () => {
    const sessions = SessionManager.create({ cookieName: 'SID' });
    expect(sessions.getIdFromCookieHeader(undefined)).toBeUndefined();
    expect(sessions.getIdFromCookieHeader('')).toBeUndefined();
    expect(sessions.getIdFromCookieHeader('a=1; SID=abc123; b=2')).toBe('abc123');
  });

  it('getIdFromRequest prefers cookie, then header, then req.sessionId, then req.context', () => {
    const sessions = SessionManager.create({ cookieName: 'SID', headerName: 'x-sid' });

    const req = {
      getHeader: (name: string) => {
        if (name === 'cookie') return 'SID=cookie-id';
        if (name === 'x-sid') return 'header-id';
        return undefined;
      },
      sessionId: 'req-session-id',
      context: { sessionId: 'ctx-id' },
    };

    expect(sessions.getIdFromRequest(req)).toBe('cookie-id');

    const req2 = {
      getHeader: (name: string) => {
        if (name === 'cookie') return '';
        if (name === 'x-sid') return 'header-id';
        return undefined;
      },
      sessionId: 'req-session-id',
      context: { sessionId: 'ctx-id' },
    };

    expect(sessions.getIdFromRequest(req2)).toBe('header-id');

    const req3 = {
      getHeader: () => undefined,
      sessionId: 'req-session-id',
      context: { sessionId: 'ctx-id' },
    };
    expect(sessions.getIdFromRequest(req3)).toBe('req-session-id');

    const req4 = {
      getHeader: () => undefined,
      sessionId: undefined,
      context: { sessionId: 'ctx-id' },
    };
    expect(sessions.getIdFromRequest(req4)).toBe('ctx-id');
  });

  it('ensureSessionId sets Set-Cookie when cookie missing and appends correctly', async () => {
    const sessions = SessionManager.create({ cookieName: 'SID' });

    const responseHeaders: Record<string, unknown> = {};
    const req = {
      getHeader: () => undefined,
      context: {},
    };
    const res = {
      getHeader: (name: string) => responseHeaders[name],
      setHeader: (name: string, value: string | string[]) => {
        responseHeaders[name] = value;
      },
    };

    const id = await sessions.ensureSessionId(req as any, res as any);
    expect(id).toBe('generated-session-id');
    expect((req as any).context.sessionId).toBe('generated-session-id');
    expect(responseHeaders['Set-Cookie']).toContain('SID=generated-session-id');

    // Existing string Set-Cookie should become array.
    responseHeaders['Set-Cookie'] = 'a=1';
    await sessions.ensureSessionId(req as any, res as any);
    expect(responseHeaders['Set-Cookie']).toEqual(['a=1', expect.stringContaining('SID=')]);

    // Existing array should append.
    responseHeaders['Set-Cookie'] = ['a=1'];
    await sessions.ensureSessionId(req as any, res as any);
    expect(responseHeaders['Set-Cookie']).toEqual([
      'a=1',
      expect.stringContaining('SID=generated-session-id'),
    ]);

    // Unknown header types should fall back to setting a string cookie.
    responseHeaders['Set-Cookie'] = 123;
    await sessions.ensureSessionId(req as any, res as any);
    expect(responseHeaders['Set-Cookie']).toContain('SID=');
  });

  it('ensureSessionId does not set cookie when already present', async () => {
    const sessions = SessionManager.create({ cookieName: 'SID' });
    const responseHeaders: Record<string, unknown> = {};

    const req = {
      getHeader: (name: string) => (name === 'cookie' ? 'SID=existing' : undefined),
      context: {},
    };
    const res = {
      getHeader: (name: string) => responseHeaders[name],
      setHeader: (name: string, value: string | string[]) => {
        responseHeaders[name] = value;
      },
    };

    const id = await sessions.ensureSessionId(req as any, res as any);
    expect(id).toBe('existing');
    expect(responseHeaders['Set-Cookie']).toBeUndefined();
  });

  it('session API supports set/get/has/forget/all/clear and cleanup removes expired sessions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const sessions = SessionManager.create({ ttlMs: 10 });
    const s = sessions.get('abc');

    expect(s.has('x')).toBe(false);
    s.set('x', 1);
    expect(s.get('x')).toBe(1);
    expect(s.has('x')).toBe(true);
    expect(s.all()).toEqual({ x: 1 });

    s.forget('x');
    expect(s.has('x')).toBe(false);

    s.set('y', 2);
    s.clear();
    expect(s.all()).toEqual({});

    // Advance beyond TTL to expire stored session.
    vi.setSystemTime(new Date('2026-01-01T00:00:00.020Z'));
    expect(sessions.cleanup()).toBe(1);

    vi.useRealTimers();
  });

  it('destroy removes a stored session', () => {
    const sessions = SessionManager.create({ ttlMs: 10_000 });
    const s1 = sessions.get('abc');
    s1.set('x', 1);
    expect(s1.all()).toEqual({ x: 1 });

    sessions.destroy('abc');

    const s2 = sessions.get('abc');
    expect(s2.all()).toEqual({});
  });
});
