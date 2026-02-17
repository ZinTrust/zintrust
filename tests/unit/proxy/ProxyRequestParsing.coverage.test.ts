import { describe, expect, it } from 'vitest';

import { parseJsonBody, validateProxyRequest } from '../../../src/proxy/ProxyRequestParsing';

describe('ProxyRequestParsing (coverage extras)', () => {
  it('validateProxyRequest returns 405 proxy error for non-POST', () => {
    const out = validateProxyRequest({ method: 'GET' });
    expect(out).not.toBeNull();
    expect(out?.status).toBe(405);
  });

  it('parseJsonBody returns 400 proxy error for invalid JSON', () => {
    const out = parseJsonBody('{not-json');
    expect('status' in out).toBe(true);
    if ('status' in out) {
      expect(out.status).toBe(400);
    }
  });
});
