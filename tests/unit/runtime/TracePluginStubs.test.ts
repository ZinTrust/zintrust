import { afterEach, describe, expect, it, vi } from 'vitest';

const clearTracePluginGlobals = (): void => {
  delete (globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__;
  delete (globalThis as Record<string, unknown>).__zintrust_system_trace_runtime__;
};

describe('trace plugin stubs', () => {
  afterEach(() => {
    clearTracePluginGlobals();
    vi.resetModules();
  });

  it('node stub publishes the system trace globals expected by core boot', async () => {
    clearTracePluginGlobals();

    await import('@/zintrust.plugins');

    expect((globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__).toBe(
      true
    );
    expect((globalThis as Record<string, unknown>).__zintrust_system_trace_runtime__).toBeDefined();
  });

  it('worker stub publishes the system trace globals expected by core boot', async () => {
    clearTracePluginGlobals();

    await import('@/zintrust.plugins.wg');

    expect((globalThis as Record<string, unknown>).__zintrust_system_trace_plugin_requested__).toBe(
      true
    );
    expect((globalThis as Record<string, unknown>).__zintrust_system_trace_runtime__).toBeDefined();
  });
});
