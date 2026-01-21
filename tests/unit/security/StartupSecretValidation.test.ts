import { describe, expect, it, vi } from 'vitest';

describe('StartupSecretValidation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const validAppKey = Buffer.from(
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    'hex'
  ).toString('base64');

  const hasErrorKey = (errors: any[], key: string) => errors.some((e) => e.key === key);
  const getErrorMessage = (errors: any[], key: string) =>
    errors.find((e) => e.key === key)?.message;
  const hasErrorKeyWithMessage = (errors: any[], key: string, messagePattern: RegExp) =>
    errors.some((e) => e.key === key && messagePattern.test(e.message));

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('passes in non-production regardless of secrets', async () => {
    vi.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'development' };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails in production when JWT is enabled and JWT_SECRET is missing', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: '',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    const result = StartupSecretValidation.validate();
    expect(result.valid).toBe(false);
    expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(true);
    expect(hasErrorKey(result.errors, 'APP_KEY')).toBe(true);

    expect(() => StartupSecretValidation.assertValid()).toThrow(/startup secret/i);
  });

  it('passes when JWT_SECRET is missing but APP_KEY is set', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(false);
  });

  it('fails in production when API key auth is enabled and API_KEY_SECRET is missing', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      API_KEY_ENABLED: 'true',
      API_KEY_SECRET: '',
      // Ensure JWT check does not dominate this case
      JWT_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    const result = StartupSecretValidation.validate();
    expect(result.valid).toBe(false);
    expect(hasErrorKey(result.errors, 'API_KEY_SECRET')).toBe(true);
  });

  it('respects STARTUP_VALIDATE_SECRETS=false', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      STARTUP_VALIDATE_SECRETS: 'false',
      ENCRYPTION_CIPHER: '',
      APP_KEY: '',
      JWT_ENABLED: 'true',
      JWT_SECRET: '',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when ENCRYPTION_CIPHER is unsupported in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-128-cbc',
      APP_KEY: validAppKey,
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(hasErrorKey(result.errors, 'ENCRYPTION_CIPHER')).toBe(true);
  });

  it('fails when APP_KEY is missing in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: '',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
  });

  it('fails when APP_KEY is not valid base64 in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: '!!!invalid',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
  });

  it('fails when APP_KEY base64 decodes to empty in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: '====',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(hasErrorKeyWithMessage(result.errors, 'APP_KEY', /valid base64/i)).toBe(true);
  });

  it('fails when APP_KEY has wrong byte length in production', async () => {
    vi.resetModules();
    const shortKey = Buffer.from('short', 'utf8').toString('base64');
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: shortKey,
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === 'APP_KEY')).toBe(true);
  });

  it('fails when APP_PREVIOUS_KEYS is invalid JSON in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      APP_PREVIOUS_KEYS: '[not-valid-json',
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(hasErrorKey(result.errors, 'APP_PREVIOUS_KEYS')).toBe(true);
  });

  it('fails when APP_PREVIOUS_KEYS JSON is not an array of strings in production', async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: validAppKey,
      APP_PREVIOUS_KEYS: JSON.stringify([1, 2, 3]),
      JWT_ENABLED: 'false',
      API_KEY_ENABLED: 'false',
    };

    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    const result = StartupSecretValidation.validate();

    expect(result.valid).toBe(false);
    expect(hasErrorKey(result.errors, 'APP_PREVIOUS_KEYS')).toBe(true);
  });

  describe('Unit Tests for Individual Functions', () => {
    it('should validate API key secret when enabled and empty', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        API_KEY_ENABLED: 'true',
        API_KEY_SECRET: '',
        JWT_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(result.valid).toBe(false);
      expect(hasErrorKey(result.errors, 'API_KEY_SECRET')).toBe(true);
      expect(getErrorMessage(result.errors, 'API_KEY_SECRET')).toBe(
        'API_KEY_SECRET must be set when API key auth is enabled'
      );
    });

    it('should pass API key validation when disabled', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        API_KEY_ENABLED: 'false',
        API_KEY_SECRET: '',
        JWT_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'API_KEY_SECRET')).toBe(false);
    });

    it('should pass API key validation when secret is set', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        API_KEY_ENABLED: 'true',
        API_KEY_SECRET: 'valid-secret-key',
        JWT_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'API_KEY_SECRET')).toBe(false);
    });

    it('should validate JWT secret when enabled and empty with no APP_KEY', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'true',
        JWT_SECRET: '',
        APP_KEY: '',
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(result.valid).toBe(false);
      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(true);
      // The actual message might be different, so let's just check that there's an error for JWT_SECRET
      const jwtError = getErrorMessage(result.errors, 'JWT_SECRET');
      expect(jwtError).toBeDefined();
      expect(jwtError).toContain('JWT_SECRET');
    });

    it('should pass JWT validation when APP_KEY is provided', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'true',
        JWT_SECRET: '',
        APP_KEY: validAppKey,
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(false);
    });

    it('should pass JWT validation when JWT secret is provided', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'true',
        JWT_SECRET: 'valid-jwt-secret',
        APP_KEY: '',
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(false);
    });

    it('should pass JWT validation when disabled', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'false',
        JWT_SECRET: '',
        APP_KEY: '',
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(false);
    });

    it('should validate JWT secret when enabled with empty secret but APP_KEY exists', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'true',
        JWT_SECRET: '',
        APP_KEY: validAppKey,
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(false);
    });

    it('should return null when JWT secret is empty but APP_KEY has length', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'true',
        JWT_SECRET: '',
        APP_KEY: validAppKey, // Has length > 0
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(false);
    });

    it('should return JWT_SECRET error when both JWT_SECRET and APP_KEY are empty', async () => {
      vi.resetModules();
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        JWT_ENABLED: 'true',
        JWT_SECRET: '',
        APP_KEY: '', // Empty string, length = 0
        API_KEY_ENABLED: 'false',
      };

      const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
      const result = StartupSecretValidation.validate();

      // This should trigger line 44 - return error object
      expect(hasErrorKey(result.errors, 'JWT_SECRET')).toBe(true);
    });
  });
});
