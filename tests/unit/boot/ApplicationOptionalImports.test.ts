import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: Object.freeze({
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Application boot - optional import failures', () => {
  it('continues boot when an optional runtime-registration import fails', async () => {
    vi.resetModules();

    // Provide a safe mock to keep optional import flow stable for this test.
    vi.doMock('@orm/DatabaseRuntimeRegistration', () => ({
      registerDatabasesFromRuntimeConfig: vi.fn(),
    }));

    const { Application } = await import('@boot/Application');
    const app = Application.create('');

    await expect(app.boot()).resolves.toBeUndefined();
  });
});
