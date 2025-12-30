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

describe('Application boot - FeatureFlags wiring', () => {
  it('calls FeatureFlags.initialize during boot', async () => {
    vi.resetModules();

    const initialize = vi.fn();
    vi.doMock('@config/features', () => ({
      FeatureFlags: Object.freeze({
        initialize,
      }),
      default: Object.freeze({
        initialize,
      }),
    }));

    const { Application } = await import('@boot/Application');
    const app = Application.create('');

    await app.boot();

    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('does not re-run FeatureFlags.initialize on repeated boot()', async () => {
    vi.resetModules();

    const initialize = vi.fn();
    vi.doMock('@config/features', () => ({
      FeatureFlags: Object.freeze({
        initialize,
      }),
      default: Object.freeze({
        initialize,
      }),
    }));

    const { Application } = await import('@boot/Application');
    const app = Application.create('');

    await app.boot();
    await app.boot();

    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
