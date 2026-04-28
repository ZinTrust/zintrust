import { afterEach, describe, expect, it, vi } from 'vitest';

describe('PluginManager lazy SpawnUtil loading', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not import the CLI spawn helper during basic runtime-only usage', async () => {
    vi.doMock('@cli/utils/spawn', () => {
      throw new Error('spawn helper should not be imported');
    });

    const { PluginManager } = await import('@runtime/PluginManager');

    expect(PluginManager.resolveId('auth')).toBe('feature:auth');
    expect(PluginManager.resolveId('missing-plugin')).toBeNull();
  });
});
