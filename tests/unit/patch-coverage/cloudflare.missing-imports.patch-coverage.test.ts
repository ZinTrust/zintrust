/* eslint-disable max-nested-callbacks */
import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: cloudflare missing imports', () => {
  it('gracefully handles import errors for optional config modules', async () => {
    vi.resetModules();

    vi.doMock('@runtime-config/middleware.ts', () => {
      throw new Error('Not found');
    });

    vi.doMock('@runtime-config/notification.ts', () => {
      throw new Error('Not found');
    });

    vi.doMock('@runtime-config/queue.ts', () => {
      throw new Error('Not found');
    });

    vi.doMock('@runtime-config/workers.ts', () => {
      throw new Error('Not found');
    });

    vi.doMock('@runtime/getKernel', () => ({
      getKernel: vi.fn().mockResolvedValue({
        handle: vi.fn(),
      }),
    }));

    vi.doMock('@runtime/adapters/CloudflareAdapter', () => ({
      CloudflareAdapter: {
        create: vi.fn(() => ({
          handle: vi.fn().mockResolvedValue({}),
          formatResponse: vi.fn().mockReturnValue({ status: 200 }),
        })),
      },
    }));

    vi.doMock('@config/logger', () => ({
      Logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const mod = await import('@/functions/cloudflare');
    const handler = mod.default.fetch;

    const response = await handler({ url: 'https://example.com/', method: 'GET' } as any, {}, {});

    expect(response.status).toBe(200);

    const overrides = (
      globalThis as unknown as { __zintrustStartupConfigOverrides?: Map<string, unknown> }
    ).__zintrustStartupConfigOverrides;

    // They should gracefully resolve to empty objects which have no default export, so undefined in the map/entries.
    // Or actually since they resolve to `{}`, the default export is `undefined`.
    expect(overrides).toBeDefined();
  });
});
