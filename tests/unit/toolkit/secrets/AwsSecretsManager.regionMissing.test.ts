import { describe, expect, it, vi } from 'vitest';

const mockExternalServiceUtilsWithEmptyEnv = async () => {
  const actual = await vi.importActual<typeof import('@common/ExternalServiceUtils')>(
    '@common/ExternalServiceUtils'
  );

  return {
    ...actual,
    readEnvString: vi.fn(() => ''),
  };
};

describe('AwsSecretsManager region missing branch', () => {
  it('doctorEnv includes AWS_REGION when both AWS_REGION and AWS_DEFAULT_REGION are empty', async () => {
    vi.resetModules();

    vi.doMock('@common/ExternalServiceUtils', mockExternalServiceUtilsWithEmptyEnv);

    const { AwsSecretsManager } = await import('@/toolkit/Secrets/providers/AwsSecretsManager');

    const missing = AwsSecretsManager.doctorEnv();
    expect(missing).toContain('AWS_REGION');
  });
});
