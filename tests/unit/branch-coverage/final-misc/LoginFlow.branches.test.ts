/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emitAuth: vi.fn(),
  sign: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitAuth: mocks.emitAuth,
  },
}));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    signAccessToken: mocks.sign,
  },
}));

vi.mock('@security/BulletproofDeviceStore', () => ({
  BulletproofDeviceStore: {
    upsert: mocks.upsert,
  },
}));

import { LoginFlow } from '@auth/LoginFlow';

const inlineProvider = {
  identify: async () => ({ id: 'u1' }),
  verify: async () => ({ subject: 'u1', claims: { sub: 'u1' } }),
};

const contextWith = (request: unknown) => ({ request });

describe('LoginFlow uncovered branches', () => {
  beforeEach(() => {
    LoginFlow.clearRegistrations();
    vi.resetAllMocks();
    mocks.sign.mockImplementation(async (claims: Record<string, unknown>) =>
      `jwt:${String(claims['sub'] ?? 'none')}`
    );
    mocks.upsert.mockImplementation(async (record: unknown) => record);
  });

  afterEach(() => {
    LoginFlow.clearRegistrations();
  });

  it('rejects invalid registrations and handler shapes', () => {
    expect(() => LoginFlow.registerProvider('', inlineProvider)).toThrow(
      /provider name must be a non-empty string/
    );
    expect(() =>
      LoginFlow.registerProvider('bad', {} as Parameters<typeof LoginFlow.registerProvider>[1])
    ).toThrow(/must expose identify\(\) and verify\(\)/);
    expect(() =>
      LoginFlow.registerIssuer('bad', 'not-a-function' as Parameters<typeof LoginFlow.registerIssuer>[1])
    ).toThrow(/issuer must be a function/);
    expect(() =>
      LoginFlow.registerAuditor('bad', 'not-a-function' as Parameters<typeof LoginFlow.registerAuditor>[1])
    ).toThrow(/auditor must be a function/);
  });

  it('rejects missing named issuer and auditor', async () => {
    await expect(
      LoginFlow.create({ provider: inlineProvider, context: {} })
        .identify({})
        .verify({})
        .issue('absent')
        .run()
    ).rejects.toThrow(/issuer "absent" is not registered/);

    await expect(
      LoginFlow.create({ provider: inlineProvider, context: {} })
        .identify({})
        .verify({})
        .audit('absent')
        .run()
    ).rejects.toThrow(/auditor "absent" is not registered/);
  });

  it('requires identify() before run()', async () => {
    await expect(
      LoginFlow.create({ provider: inlineProvider, context: {} }).verify({}).run()
    ).rejects.toThrow(/identify\(\) must be called before run\(\)/);
  });

  it('omits issued when no issuer is requested', async () => {
    const auditor = vi.fn();
    const result = await LoginFlow.create({ provider: inlineProvider, context: {} })
      .identify({})
      .verify({})
      .audit(auditor)
      .run();

    expect(result.identity).toEqual({ id: 'u1' });
    expect(result).not.toHaveProperty('issued');
    expect(auditor).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', provider: 'inline', issued: undefined })
    );
  });

  it('validates verified record shape, subject and claims', async () => {
    const cases: Array<[unknown, RegExp]> = [
      ['not-an-object', /must return an object/],
      [{ subject: 42 }, /returned an invalid subject/],
      [{ subject: '   ' }, /returned an invalid subject/],
      [{ claims: 'not-an-object' }, /returned invalid claims/],
    ];

    for (const [value, pattern] of cases) {
      await expect(
        LoginFlow.create({
          provider: { identify: inlineProvider.identify, verify: async () => value },
          context: {},
        })
          .identify({})
          .verify({})
          .run()
      ).rejects.toThrow(pattern);
    }
  });

  it('wraps non-object verify errors and audits them', async () => {
    const auditor = vi.fn();
    await expect(
      LoginFlow.create({
        provider: {
          identify: inlineProvider.identify,
          verify: async () => {
            throw 'string failure';
          },
        },
        context: { tenant: 't' },
      })
        .identify({})
        .verify({})
        .audit(auditor)
        .run()
    ).rejects.toMatchObject({ stage: 'verify', message: 'LoginFlow verify() failed' });

    expect(auditor).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', stage: 'verify' })
    );
  });

  it('maps subject and claims into jwt tokens in every combination', async () => {
    const signAndRead = async (verified: Record<string, unknown>) => {
      mocks.sign.mockClear();
      await LoginFlow.create({
        provider: { identify: inlineProvider.identify, verify: async () => verified },
        context: {},
      })
        .identify({})
        .verify({})
        .issue('jwt')
        .run();
      return mocks.sign.mock.calls[0]?.[0] as Record<string, unknown>;
    };

    expect(await signAndRead({ subject: 'u1', claims: undefined })).toEqual({ sub: 'u1' });
    expect(await signAndRead({ subject: 'u1', claims: { sub: 'existing' } })).toEqual({
      sub: 'existing',
    });
    expect(await signAndRead({ claims: {} })).toEqual({});
  });

  it('falls back to generated ids when context and request values are unusable', async () => {
    const result = await LoginFlow.create({
      provider: {
        identify: inlineProvider.identify,
        verify: async () => ({}),
      },
      context: 'not-an-object' as unknown as Record<string, unknown>,
    })
      .identify({})
      .verify({})
      .issue('bulletproof')
      .run();

    const record = mocks.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(record['deviceId']).toMatch(/^dev_[0-9a-f]{32}$/);
    expect(record).not.toHaveProperty('userId');
    expect(record).not.toHaveProperty('userAgent');
    expect(mocks.sign).toHaveBeenCalledWith({ deviceId: record['deviceId'] });
    expect(result.issued).toMatchObject({ token_type: 'Bearer' });
  });

  it('handles non-object request, blank body values and invalid header values', async () => {
    const __request = {
      getBody: () => ({ deviceId: '   ', userId: 42 }),
      getHeader: (name: string) =>
        name === 'user-agent' ? [42] : '  ',
    };
    await LoginFlow.create({
      provider: {
        identify: inlineProvider.identify,
        verify: async () => ({ user: { name: 'no-id' }, claims: undefined }),
      },
      context: contextWith('not-an-object') as unknown as Record<string, unknown>,
    })
      .identify({})
      .verify({})
      .issue('bulletproof')
      .run();

    let record = mocks.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(record['deviceId']).toMatch(/^dev_[0-9a-f]{32}$/);
    expect(record).not.toHaveProperty('userId');
    expect(record).not.toHaveProperty('userAgent');

    mocks.upsert.mockClear();
    await LoginFlow.create({
      provider: {
        identify: inlineProvider.identify,
        verify: async () => ({}),
      },
      context: {
        deviceId: 42,
        request: {
          getBody: () => ({ deviceId: 42 }),
          getHeader: () => '   ',
        },
      } as unknown as Record<string, unknown>,
    })
      .identify({})
      .verify({})
      .issue('bulletproof')
      .run();

    record = mocks.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(record['deviceId']).toMatch(/^dev_[0-9a-f]{32}$/);
    expect(record).not.toHaveProperty('userAgent');
  });

  it('uses string headers, body ids and verified user ids when available', async () => {
    await LoginFlow.create({
      provider: {
        identify: inlineProvider.identify,
        verify: async () => ({ user: { id: 99 }, subject: 'subject-99', claims: {} }),
      },
      context: {
        request: {
          getBody: () => ({ deviceId: ' body-id ' }),
          getHeader: () => ' agent/2 ',
        },
      } as unknown as Record<string, unknown>,
    })
      .identify({})
      .verify({})
      .issue('bulletproof')
      .run();

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'body-id', userId: 'subject-99', userAgent: 'agent/2' })
    );
  });

  it('uses context strings and emits trace success events', async () => {
    await LoginFlow.create({
      provider: {
        identify: inlineProvider.identify,
        verify: async () => ({ subject: 'subject-1', claims: {} }),
      },
      context: { deviceId: ' ctx-device ', userId: ' ctx-user ' },
    })
      .identify({})
      .verify({})
      .issue('bulletproof')
      .audit()
      .run();

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'ctx-device', userId: 'ctx-user' })
    );
    expect(mocks.emitAuth).toHaveBeenCalledWith('login', 'subject-1');

    await LoginFlow.create({
      provider: {
        identify: inlineProvider.identify,
        verify: async () => ({}),
      },
      context: {
        request: {
          getBody: () => ({}),
          getHeader: () => [42],
        },
      } as unknown as Record<string, unknown>,
    })
      .identify({})
      .verify({})
      .issue('bulletproof')
      .run();

    expect(mocks.upsert.mock.calls[1]?.[0]).not.toHaveProperty('userAgent');
  });
});
