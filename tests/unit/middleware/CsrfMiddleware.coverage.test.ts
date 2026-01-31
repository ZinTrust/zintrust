import { afterEach, describe, expect, it, vi } from 'vitest';

const createSessionManagerMock = () => ({
  ensureSessionId: vi.fn(async () => 'session-1'),
});

describe('CsrfMiddleware (coverage)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns early when no managers are registered', async () => {
    vi.useFakeTimers();

    const cleanupSpy = vi.fn().mockResolvedValue(0);
    vi.doMock('@security/CsrfTokenManager', () => ({
      CsrfTokenManager: {
        create: () => ({ cleanup: cleanupSpy }),
      },
    }));
    vi.doMock('@session/SessionManager', () => ({
      SessionManager: {
        create: () => createSessionManagerMock(),
      },
    }));

    await import('@middleware/CsrfMiddleware');

    vi.advanceTimersByTime(3600000);
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  it('cleans up active managers and removes dead refs', async () => {
    vi.useFakeTimers();

    const realWeakRef = globalThis.WeakRef;
    class TestWeakRef<T extends object> {
      constructor(private value: T) {}
      deref(): T | undefined {
        return (this.value as { __dead?: boolean }).__dead ? undefined : this.value;
      }
    }
    globalThis.WeakRef = TestWeakRef as unknown as typeof WeakRef;

    try {
      const cleanupSpy = vi.fn().mockResolvedValue(0);
      let createCount = 0;

      vi.doMock('@security/CsrfTokenManager', () => ({
        CsrfTokenManager: {
          create: () => {
            createCount += 1;
            if (createCount === 2) {
              return { cleanup: vi.fn(), __dead: true } as any;
            }
            return { cleanup: cleanupSpy } as any;
          },
        },
      }));
      vi.doMock('@session/SessionManager', () => ({
        SessionManager: {
          create: () => createSessionManagerMock(),
        },
      }));

      const { CsrfMiddleware } = await import('@middleware/CsrfMiddleware');

      CsrfMiddleware.create();
      CsrfMiddleware.create();

      vi.advanceTimersByTime(3600000);
      expect(cleanupSpy).toHaveBeenCalled();
    } finally {
      globalThis.WeakRef = realWeakRef;
    }
  });
});
