import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This test ensures the fallback storage path is used when 'node:async_hooks' import fails
vi.resetModules();

describe('RequestContext fallback storage', () => {
  beforeEach(() => {
    // mock the import to throw when required
    vi.mock('node:async_hooks', () => {
      throw new Error('no async hooks');
    });
  });

  afterEach(() => {
    vi.unmock('node:async_hooks');
  });

  it('uses fallback storage when async_hooks is unavailable', async () => {
    // import after mocking to force module init path
    const { RequestContext } = await import('@/http/RequestContext');

    let captured: any;
    await RequestContext.run(
      {
        requestId: 'x',
        startTime: 0,
        method: '',
        path: '',
      },
      async () => {
        const cur = await RequestContext.current();
        captured = cur;
      }
    );

    expect(captured).toBeDefined();
    expect(captured?.requestId).toBe('x');
  });
});
