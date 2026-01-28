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
    const mod = await import('../../../src/observability/OpenTelemetry');

    const spanData = mod.OpenTelemetry.startHttpServerSpan(
      { getHeader: () => undefined },
      { method: 'GET', path: '/health' }
    );

    expect(spanData).toBeDefined();

    mod.OpenTelemetry.setHttpRoute(spanData.span, 'GET', '/health');
    mod.OpenTelemetry.endHttpServerSpan(spanData.span, { status: 200 });
    mod.OpenTelemetry.injectTraceHeaders({});
    mod.OpenTelemetry.recordDbQuerySpan({ driver: 'sqlite', durationMs: 5 });
  });
});
