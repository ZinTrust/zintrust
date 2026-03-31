import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: CloudflareProxyShared', () => {
  it('maps invalid json parser errors to the shared invalid body message', async () => {
    vi.resetModules();

    vi.doMock('@helper/index', () => ({
      isString: (value: unknown): value is string => typeof value === 'string',
    }));
    vi.doMock('@proxy/ErrorHandler', () => ({
      ErrorHandler: {
        toProxyError: (status: number, code: string, message: string) => ({
          status,
          body: { code, message },
        }),
      },
    }));
    vi.doMock('@proxy/RequestValidator', () => ({
      RequestValidator: {
        parseJson: () => ({
          ok: false,
          error: {
            code: 'INVALID_JSON',
            message: 'boom',
          },
        }),
      },
    }));
    vi.doMock('@proxy/SigningService', () => ({
      SigningService: {
        verifyWithKeyProvider: vi.fn(),
      },
    }));

    const { parseOptionalJson } = await import('@/proxy/CloudflareProxyShared');
    const result = parseOptionalJson('{');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      await expect(result.response.json()).resolves.toEqual({
        code: 'INVALID_JSON',
        message: 'Invalid JSON body',
      });
    }
  });
});
