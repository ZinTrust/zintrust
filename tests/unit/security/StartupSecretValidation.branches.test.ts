import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isProduction: true,
  validateSecrets: true,
  apiKeyEnabled: false,
  apiKeySecret: '',
  jwtEnabled: false,
  jwtSecret: 'jwt',
  jwtSecretThrows: false,
  appKey: '',
  cipher: '',
  prevKeys: '',
}));

vi.mock('@config/app', () => ({
  appConfig: {
    isProduction: () => state.isProduction,
  },
}));

vi.mock('@config/startup', () => ({
  startupConfig: {
    get validateSecrets() {
      return state.validateSecrets;
    },
  },
}));

vi.mock('@config/security', () => ({
  securityConfig: {
    apiKey: {
      get enabled() {
        return state.apiKeyEnabled;
      },
      get secret() {
        return state.apiKeySecret;
      },
    },
    jwt: {
      get enabled() {
        return state.jwtEnabled;
      },
      get secret() {
        if (state.jwtSecretThrows) throw new Error('jwt secret explode');
        return state.jwtSecret;
      },
    },
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get APP_KEY() {
      return state.appKey;
    },
    get ENCRYPTION_CIPHER() {
      return state.cipher;
    },
    get APP_PREVIOUS_KEYS() {
      return state.prevKeys;
    },
  },
}));

describe('StartupSecretValidation (branches)', () => {
  beforeEach(() => {
    state.isProduction = true;
    state.validateSecrets = true;
    state.apiKeyEnabled = false;
    state.apiKeySecret = '';
    state.jwtEnabled = false;
    state.jwtSecret = 'jwt';
    state.jwtSecretThrows = false;
    state.appKey = '';
    state.cipher = '';
    state.prevKeys = '';
    vi.resetModules();
  });

  it('returns valid when disabled or not production', async () => {
    state.validateSecrets = false;
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');
    expect(StartupSecretValidation.validate()).toEqual({ valid: true, errors: [] });

    state.validateSecrets = true;
    state.isProduction = false;
    expect(StartupSecretValidation.validate()).toEqual({ valid: true, errors: [] });
  });

  it('collects jwt/api-key/encryption errors across branches', async () => {
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    state.jwtEnabled = true;
    state.jwtSecret = '';
    state.apiKeyEnabled = true;
    state.apiKeySecret = '';
    state.cipher = ''; // missing cipher triggers early encryption error
    let result = StartupSecretValidation.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.key)).toEqual(
      expect.arrayContaining(['JWT_SECRET', 'API_KEY_SECRET', 'ENCRYPTION_CIPHER'])
    );

    state.cipher = 'nope';
    state.appKey = 'base64:'; // invalid base64 -> decoded length 0
    result = StartupSecretValidation.validate();
    expect(result.errors.map((e) => e.key)).toEqual(
      expect.arrayContaining(['ENCRYPTION_CIPHER', 'APP_KEY'])
    );

    state.cipher = 'aes-256-gcm';
    state.appKey = Buffer.from('short').toString('base64'); // not 32 bytes
    state.prevKeys = '["ok", 1]';
    result = StartupSecretValidation.validate();
    expect(result.errors.map((e) => e.key)).toEqual(
      expect.arrayContaining(['APP_KEY', 'APP_PREVIOUS_KEYS'])
    );

    state.prevKeys = '[{"oops":true}]';
    result = StartupSecretValidation.validate();
    expect(result.errors.some((e) => e.key === 'APP_PREVIOUS_KEYS')).toBe(true);
  });

  it('jwt validation tolerates missing JWT_SECRET when APP_KEY is present, and catches secret getter errors', async () => {
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    state.jwtEnabled = true;
    state.jwtSecret = '';
    state.appKey = Buffer.alloc(32).toString('base64');
    state.cipher = 'aes-256-cbc';
    let result = StartupSecretValidation.validate();
    expect(result.errors.some((e) => e.key === 'JWT_SECRET')).toBe(false);

    state.jwtSecretThrows = true;
    result = StartupSecretValidation.validate();
    expect(result.errors.find((e) => e.key === 'JWT_SECRET')?.message).toContain(
      'jwt secret explode'
    );
  });

  it('covers encryption APP_KEY missing and APP_PREVIOUS_KEYS invalid JSON', async () => {
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    state.cipher = 'aes-256-cbc';
    state.appKey = '';
    let result = StartupSecretValidation.validate();
    expect(result.errors.map((e) => e.key)).toEqual(expect.arrayContaining(['APP_KEY']));

    state.appKey = Buffer.alloc(32).toString('base64');
    state.prevKeys = '[not-json';
    result = StartupSecretValidation.validate();
    expect(result.errors.find((e) => e.key === 'APP_PREVIOUS_KEYS')?.message).toContain(
      'valid JSON'
    );
  });

  it('api key validation passes when secret is present', async () => {
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    state.apiKeyEnabled = true;
    state.apiKeySecret = 'secret';
    state.cipher = 'aes-256-gcm';
    state.appKey = Buffer.alloc(32).toString('base64');
    state.jwtEnabled = false;

    const result = StartupSecretValidation.validate();
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('covers nullish env/config branches and assertValid() success early return', async () => {
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    state.apiKeyEnabled = true;
    state.apiKeySecret = undefined as any;
    state.jwtEnabled = true;
    state.jwtSecretThrows = true;

    // Drive nullish-coalescing branches in encryption validation.
    state.cipher = undefined as any;
    state.appKey = undefined as any;
    state.prevKeys = undefined as any;

    let result = StartupSecretValidation.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.key)).toEqual(
      expect.arrayContaining(['API_KEY_SECRET', 'JWT_SECRET', 'ENCRYPTION_CIPHER'])
    );

    // Hit the non-Error catch branch.
    state.jwtSecretThrows = false;
    state.jwtSecret = {
      trim: () => {
        // eslint-disable-next-line no-throw-literal
        throw 'nope';
      },
    } as any;
    result = StartupSecretValidation.validate();
    expect(result.errors.find((e) => e.key === 'JWT_SECRET')?.message).toBe('Unknown error');

    // Make configuration valid and ensure assertValid returns (true branch).
    state.jwtEnabled = false;
    state.apiKeyEnabled = false;
    state.cipher = 'aes-256-gcm';
    state.appKey = Buffer.alloc(32).toString('base64');
    state.prevKeys = '[]';
    expect(() => StartupSecretValidation.assertValid()).not.toThrow();
  });

  it('covers Env.* nullish-coalescing fallbacks', async () => {
    const { StartupSecretValidation } = await import('@security/StartupSecretValidation');

    // Cover (Env.APP_KEY ?? '').trim() and (Env.ENCRYPTION_CIPHER ?? '').trim()
    state.jwtEnabled = true;
    state.jwtSecretThrows = false;
    state.jwtSecret = 'jwt';
    state.appKey = undefined as any;
    state.cipher = null as any;
    state.prevKeys = undefined as any;
    expect(StartupSecretValidation.validate().errors.map((e) => e.key)).toEqual(
      expect.arrayContaining(['ENCRYPTION_CIPHER'])
    );

    // Cover (Env.APP_PREVIOUS_KEYS ?? '').trim() without triggering errors.
    state.jwtEnabled = false;
    state.apiKeyEnabled = false;
    state.cipher = 'aes-256-gcm';
    state.appKey = Buffer.alloc(32).toString('base64');
    state.prevKeys = undefined as any;
    expect(StartupSecretValidation.validate()).toEqual({ valid: true, errors: [] });
  });
});
