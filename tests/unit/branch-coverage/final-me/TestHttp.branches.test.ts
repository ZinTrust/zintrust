import { describe, expect, it } from 'vitest';

import { TestHttp } from '@/testing/TestHttp';

describe('TestHttp branches', () => {
  it('createRequest applies defaults and optional inputs', () => {
    const plain = TestHttp.createRequest();
    expect(plain.getMethod()).toBe('GET');

    const full = TestHttp.createRequest({
      method: 'POST',
      path: '/submit',
      headers: { 'X-Test': 'yes' },
      body: { a: 1 },
      params: { id: '7' },
      validated: { body: {}, query: {}, params: {}, headers: {} },
      context: { tenantId: 't' },
    });
    expect(full.getHeader('x-test')).toBe('yes');
    expect(full.getParam('id')).toBe('7');
    expect(full.validated).toBeDefined();
    expect(full.context?.['tenantId']).toBe('t');
  });

  it('createRequest ignores null and Error validated values', () => {
    const fallback = TestHttp.createRequest().validated;
    expect(TestHttp.createRequest({ validated: null as any }).validated).toEqual(fallback);
    expect(TestHttp.createRequest({ validated: new Error('x') as any }).validated).toEqual(fallback);
  });

  it('createValidatedRequest forwards validated input', () => {
    const validated = { body: { n: 1 }, query: {}, params: {}, headers: {} };
    const req = TestHttp.createValidatedRequest({ validated });
    expect(req.validated).toBe(validated);
  });

  it('response recorder covers status, headers, body formats and raw end', () => {
    const res = TestHttp.createResponseRecorder();
    expect(res.getStatus()).toBe(200);
    res.status(201);
    expect(res.getStatus()).toBe(201);
    expect(res.statusCode).toBe(201);

    res.setHeader('X-A', 'a');
    expect(res.getHeader('X-A')).toBe('a');
    expect(res.getHeaders()).toEqual({ 'X-A': 'a' });

    res.json({ ok: true });
    expect(res.getJson()).toEqual({ ok: true });
    expect(res.getBodyText()).toBe('{"ok":true}');

    res.text('plain');
    expect(res.getBodyText()).toBe('plain');
    res.html('<b>x</b>');
    expect(res.getBodyText()).toBe('<b>x</b>');
    res.send(Buffer.from('buffer'));
    expect(res.getBodyText()).toBe('buffer');
    res.send(42 as any);
    expect(res.getBodyText()).toBe('42');

    res.redirect('/next');
    expect(res.getStatus()).toBe(302);
    res.redirect('/next', 307);
    expect(res.getStatus()).toBe(307);

    const raw = res.getRaw();
    raw.end();
    expect((raw as any).writableEnded).toBe(true);
    res.setStatus(404).getRaw().end('raw body');
    expect(res.getBodyText()).toBe('42raw body');
  });
});
