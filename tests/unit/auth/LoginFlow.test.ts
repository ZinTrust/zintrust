import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitAuth: vi.fn(),
  },
}));

vi.mock('@security/JwtManager', () => ({
  JwtManager: {
    signAccessToken: vi.fn(
      async (payload: Record<string, unknown>) => `jwt:${String(payload.sub ?? 'none')}`
    ),
  },
}));

import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { LoginFlow } from '@auth/LoginFlow';
import { JwtManager } from '@security/JwtManager';

describe('LoginFlow', () => {
  beforeEach(() => {
    LoginFlow.clearRegistrations();
    vi.clearAllMocks();
  });

  afterEach(() => {
    LoginFlow.clearRegistrations();
  });

  it('runs provider identify/verify and built-in jwt issuer', async () => {
    LoginFlow.registerProvider('password', {
      identify: async (input, context) => {
        const record = input as { email: string };
        return {
          id: 'user-1',
          email: record.email,
          passwordHash: `hash:${context.tenant}`,
        };
      },
      verify: async (identity, input, context) => {
        const record = input as { password: string };
        if (record.password !== `pass:${context.tenant}`) {
          throw new Error('bad password');
        }

        return {
          user: identity,
          subject: 'user-1',
          claims: {
            sub: 'user-1',
            tenant: context.tenant,
            email: (identity as { email: string }).email,
          },
        };
      },
    });

    const result = await LoginFlow.create({
      provider: 'password',
      context: { tenant: 'main' },
    })
      .identify({ email: 'user@example.com' })
      .verify({ password: 'pass:main' })
      .issue('jwt')
      .run();

    expect(JwtManager.signAccessToken).toHaveBeenCalledWith({
      sub: 'user-1',
      tenant: 'main',
      email: 'user@example.com',
    });
    expect(result).toEqual({
      identity: {
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'hash:main',
      },
      verified: {
        user: {
          id: 'user-1',
          email: 'user@example.com',
          passwordHash: 'hash:main',
        },
        subject: 'user-1',
        claims: {
          sub: 'user-1',
          tenant: 'main',
          email: 'user@example.com',
        },
      },
      issued: 'jwt:user-1',
    });
  });

  it('supports inline provider, inline issuer, and custom auditor', async () => {
    const auditSpy = vi.fn(async () => undefined);

    const result = await LoginFlow.create({
      provider: {
        identify: async (input) => ({ account: (input as { email: string }).email }),
        verify: async (identity, input, context) => ({
          user: identity,
          subject: context.subject,
          metadata: { password: (input as { password: string }).password },
        }),
      },
      context: { subject: 'inline-user' },
    })
      .identify({ email: 'inline@example.com' })
      .verify({ password: 'secret' })
      .issue(async ({ verified }) => ({ token: `inline:${verified.subject}` }))
      .audit(auditSpy)
      .run();

    expect(auditSpy).toHaveBeenCalledWith({
      status: 'success',
      provider: 'inline',
      issuer: 'inline',
      identity: { account: 'inline@example.com' },
      verified: {
        user: { account: 'inline@example.com' },
        subject: 'inline-user',
        metadata: { password: 'secret' },
      },
      issued: { token: 'inline:inline-user' },
      context: { subject: 'inline-user' },
    });
    expect(result.issued).toEqual({ token: 'inline:inline-user' });
  });

  it('audits failures with the built-in trace auditor', async () => {
    LoginFlow.registerProvider('password', {
      identify: async () => ({ id: 'user-2' }),
      verify: async () => {
        throw new Error('nope');
      },
    });

    await expect(
      LoginFlow.create({ provider: 'password', context: { requestId: 'r1' } })
        .identify({ email: 'user@example.com' })
        .verify({ password: 'wrong' })
        .audit()
        .run()
    ).rejects.toMatchObject({
      stage: 'verify',
      message: 'LoginFlow verify() failed',
    });

    expect(SystemTraceBridge.emitAuth).toHaveBeenCalledWith('failed', undefined);
  });

  it('throws when the named provider is missing', async () => {
    await expect(
      LoginFlow.create({ provider: 'missing', context: {} })
        .identify({ email: 'user@example.com' })
        .verify({ password: 'secret' })
        .run()
    ).rejects.toMatchObject({
      stage: 'identify',
      message: 'LoginFlow provider "missing" is not registered',
    });
  });

  it('throws when verify is omitted', async () => {
    LoginFlow.registerProvider('password', {
      identify: async () => ({ id: 'user-3' }),
      verify: async () => ({ subject: 'user-3' }),
    });

    await expect(
      LoginFlow.create({ provider: 'password', context: {} })
        .identify({ email: 'user@example.com' })
        .run()
    ).rejects.toMatchObject({
      stage: 'verify',
      message: 'LoginFlow verify() must be called before run()',
    });
  });

  it('exposes built-in registrations after reset', () => {
    expect(LoginFlow.hasIssuer('jwt')).toBe(true);
    expect(LoginFlow.hasAuditor('trace')).toBe(true);
  });

  it('registers and unregisters named providers, issuers, and auditors', async () => {
    const provider = {
      identify: async () => ({ id: 'user-9' }),
      verify: async () => ({ subject: 'user-9' }),
    };
    const issuer = vi.fn(async () => 'issued:custom');
    const auditor = vi.fn(async () => undefined);

    LoginFlow.registerProvider('custom', provider);
    LoginFlow.registerIssuer('custom', issuer);
    LoginFlow.registerAuditor('custom', auditor);

    expect(LoginFlow.hasProvider('custom')).toBe(true);
    expect(LoginFlow.hasIssuer('custom')).toBe(true);
    expect(LoginFlow.hasAuditor('custom')).toBe(true);

    const result = await LoginFlow.create({ provider: 'custom', context: { requestId: 'r9' } })
      .identify({ email: 'custom@example.com' })
      .verify({ password: 'secret' })
      .issue('custom')
      .audit('custom')
      .run();

    expect(result.issued).toBe('issued:custom');
    expect(issuer).toHaveBeenCalledWith({
      verified: { subject: 'user-9' },
      context: { requestId: 'r9' },
    });
    expect(auditor).toHaveBeenCalledWith({
      status: 'success',
      provider: 'custom',
      issuer: 'custom',
      identity: { id: 'user-9' },
      verified: { subject: 'user-9' },
      issued: 'issued:custom',
      context: { requestId: 'r9' },
    });

    LoginFlow.unregisterProvider('custom');
    LoginFlow.unregisterIssuer('custom');
    LoginFlow.unregisterAuditor('custom');

    expect(LoginFlow.hasProvider('custom')).toBe(false);
    expect(LoginFlow.hasIssuer('custom')).toBe(false);
    expect(LoginFlow.hasAuditor('custom')).toBe(false);
  });
});
