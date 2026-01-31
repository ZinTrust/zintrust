import { describe, expect, it, vi } from 'vitest';

describe('AwsSecretsManager region missing branch', () => {
  it('doctorEnv includes AWS_REGION when both AWS_REGION and AWS_DEFAULT_REGION are empty', async () => {
    vi.resetModules();

    vi.doMock('@config/env', () => {
      const Env = Object.freeze({
        get: (_k: string, _d?: string) => '',
      });
      return { Env };
    });

    const { AwsSecretsManager } = await import('@/toolkit/Secrets/providers/AwsSecretsManager');

    const missing = AwsSecretsManager.doctorEnv();
    expect(missing).toContain('AWS_REGION');
  });
});
