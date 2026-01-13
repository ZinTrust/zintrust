import { describe, expect, it } from 'vitest';

import {
  StartupConfigFile,
  StartupConfigFileRegistry,
} from '../../../src/runtime/StartupConfigFileRegistry';

describe('src/runtime/StartupConfigFileRegistry patch coverage (extra)', () => {
  it('tracks preload state and supports test-only clearing', async () => {
    StartupConfigFileRegistry.clear();
    expect(StartupConfigFileRegistry.isPreloaded()).toBe(false);

    expect(StartupConfigFileRegistry.has(StartupConfigFile.Cache)).toBe(false);
    expect(StartupConfigFileRegistry.get(StartupConfigFile.Cache)).toBeUndefined();

    await StartupConfigFileRegistry.preload([]);
    expect(StartupConfigFileRegistry.isPreloaded()).toBe(true);

    StartupConfigFileRegistry.clear();
    expect(StartupConfigFileRegistry.isPreloaded()).toBe(false);
  });
});
