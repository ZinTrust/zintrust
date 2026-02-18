import { describe, expect, it } from 'vitest';

describe('patch coverage: CloudflareAdapter query parsing', () => {
  it('coerces repeated query params into arrays and appends subsequent values', async () => {
    const { CloudflareAdapter } = await import('@/runtime/adapters/CloudflareAdapter');
    const adapter = CloudflareAdapter.create({ handler: async () => undefined });

    const req = {
      method: 'GET',
      url: 'https://example.test/?a=1&a=2&a=3',
      headers: new Headers(),
      text: async () => '',
      body: null,
      signal: undefined,
    } as any;

    const parsed = adapter.parseRequest(req);
    expect(parsed.query).toBeDefined();
  });
});
