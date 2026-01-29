import { describe, expect, it, vi } from 'vitest';

vi.mock('node:module', () => {
  return {
    createRequire: () => () => {
      throw new Error('missing');
    },
  };
});

describe('OpenTelemetry optional integration', () => {
  it('does not throw when @opentelemetry/api is missing', async () => {
    vi.doMock('@config/env', () => ({
      Env: {
        getBool: (key: string, defaultValue: boolean) =>
          key === 'OTEL_ENABLED' ? true : defaultValue,
      },
    }));

    const mod = await import('../../../src/observability/OpenTelemetry');

    const spanData = mod.OpenTelemetry.startHttpServerSpan(
      { getHeader: () => undefined },
      { method: 'GET', path: '/health' }
    );

    expect(spanData).toBeDefined();

    mod.OpenTelemetry.setHttpRoute(spanData.span, 'GET', '/health');
    mod.OpenTelemetry.endHttpServerSpan(spanData.span, { status: 200 });
    mod.OpenTelemetry.injectTraceHeaders({});
    await mod.OpenTelemetry.runWithContext({} as any, async () => 'ok');
    mod.OpenTelemetry.recordDbQuerySpan({ driver: 'sqlite', durationMs: 5 });
  });
});
