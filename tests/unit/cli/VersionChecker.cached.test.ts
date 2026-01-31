import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VersionChecker.getCachedVersion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns cached version when within interval', async () => {
    const now = Date.now();
    const ls = new Map<string, string>();
    ls.set('zintrust_last_version_check', (now - 1000).toString());
    ls.set('zintrust_cached_latest_version', '9.9.9');

    // Minimal localStorage shim
    (globalThis as any).localStorage = {
      getItem: (k: string) => ls.get(k) ?? null,
    } as Storage;

    const { VersionChecker } = await import('@/cli/services/VersionChecker');

    const cached = VersionChecker.getCachedVersion(24);
    expect(cached).toBe('9.9.9');
  });
});
