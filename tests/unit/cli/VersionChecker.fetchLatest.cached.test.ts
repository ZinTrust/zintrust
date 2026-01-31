import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('VersionChecker.fetchLatestVersion uses cached value', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns cached version from localStorage when available', async () => {
    const now = Date.now();
    const ls = new Map<string, string>();
    ls.set('zintrust_last_version_check', (now - 1000).toString());
    ls.set('zintrust_cached_latest_version', '8.8.8');

    (globalThis as any).localStorage = {
      getItem: (k: string) => ls.get(k) ?? null,
    } as Storage;

    const { VersionChecker } = await import('@/cli/services/VersionChecker');

    const latest = await VersionChecker.fetchLatestVersion();
    expect(latest).toBe('8.8.8');
  });
});
