import { describe, expect, it } from 'vitest';

import { TestHttp } from '../../helpers/TestHttp';

describe('TestHttp helpers', () => {
  it('createValidatedRequest provides typed validated payload', () => {
    const req = TestHttp.createValidatedRequest<
      { email: string },
      { q?: string },
      { id: string },
      { authorization?: string }
    >({
      method: 'POST',
      path: '/test',
      validated: {
        body: { email: 'a@example.test' },
        query: { q: 'x' },
        params: { id: '1' },
        headers: { authorization: 'Bearer x' },
      },
    });

    expect(req.getMethod()).toBe('POST');
    expect(req.getPath()).toBe('/test');
    expect(req.validated.body.email).toBe('a@example.test');
    expect(req.validated.params.id).toBe('1');
  });

  it('createResponseRecorder captures status and json', () => {
    const res = TestHttp.createResponseRecorder();

    res.setStatus(201).json({ ok: true });

    expect(res.getStatus()).toBe(201);
    expect(res.getJson()).toEqual({ ok: true });
    expect(res.getBodyText()).toBe('{"ok":true}');
  });
});
