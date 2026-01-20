import { ErrorFactory, Errors, initZintrustError } from '@/exceptions/ZintrustError';
import { describe, expect, it, vi } from 'vitest';

describe('ZinTrustError internals', () => {
  it('applies name, details, prototype and defaults', () => {
    const e = new Error('msg');

    const protoObj = { custom: true } as object;

    initZintrustError(e, {
      name: 'CustomName',
      details: { a: 1 },
      prototype: protoObj as any,
      statusCode: 418,
      code: 'TEA',
    });

    expect(e.name).toBe('CustomName');
    expect((e as any).statusCode).toBe(418);
    expect((e as any).code).toBe('TEA');
    expect((e as any).details).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(e)).toBe(protoObj);
  });

  it('handles missing captureStackTrace gracefully', () => {
    const orig = (Error as any).captureStackTrace;
    try {
      // remove captureStackTrace
      (Error as any).captureStackTrace = undefined;

      const e = new Error('no-stack');
      initZintrustError(e, { name: 'NoStack' });
      expect(e.name).toBe('NoStack');
    } finally {
      (Error as any).captureStackTrace = orig;
    }
  });

  it('createTryCatchError logs an error via Logger', () => {
    // ensure the branch is executed and returns a typed error
    const err = Errors.catchError('boom', { foo: 'bar' });
    expect(err).toBeInstanceOf(Error);
    expect((err as any).code).toBe('TRY_CATCH_ERROR');
  });

  it('Errors helper returns proper typed errors', () => {
    const e = Errors.database('dberr');
    expect(e).toBeInstanceOf(Error);
    expect((e as any).code).toBe('DATABASE_ERROR');

    const nf = Errors.notFound();
    expect((nf as any).statusCode).toBe(404);
    expect((nf as any).code).toBe('NOT_FOUND');

    const v = Errors.validation('v');
    expect((v as any).code).toBe('VALIDATION_ERROR');

    // additional branches
    const cli = Errors.cli('clierr');
    expect((cli as any).code).toBe('CLI_ERROR');
    expect((cli as any).statusCode).toBe(1);

    const sec = Errors.security('secerr');
    expect((sec as any).code).toBe('SECURITY_ERROR');
    expect((sec as any).statusCode).toBe(401);

    // ErrorFactory wrappers
    const ce = ErrorFactory.createCliError('cli2');
    expect((ce as any).code).toBe('CLI_ERROR');
    expect((ce as any).statusCode).toBe(1);

    const se = ErrorFactory.createSecurityError('sec2');
    expect((se as any).code).toBe('SECURITY_ERROR');
    expect((se as any).statusCode).toBe(401);
  });

  it('createTryCatchError calls Logger.error', async () => {
    vi.resetModules();
    const loggerError = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
    }));

    const mod = await import('@/exceptions/ZintrustError');

    const e = mod.ErrorFactory.createTryCatchError('boom2', { x: 1 });
    expect((e as any).code).toBe('TRY_CATCH_ERROR');
    expect(loggerError).toHaveBeenCalled();
  });

  it('ErrorFactory methods support default messages and forbidden/unauthorized', () => {
    const nf = ErrorFactory.createNotFoundError();
    expect((nf as any).code).toBe('NOT_FOUND');
    expect(nf.message).toBe('Resource not found');

    const fe = ErrorFactory.createForbiddenError('forbid');
    expect((fe as any).code).toBe('FORBIDDEN');

    const ue = ErrorFactory.createUnauthorizedError();
    expect((ue as any).statusCode).toBe(401);
  });

  it('can create all typed errors via ErrorFactory', () => {
    const c = ErrorFactory.createConnectionError('c', {});
    expect((c as any).code).toBe('CONNECTION_ERROR');

    const cfg = ErrorFactory.createConfigError('cfg');
    expect((cfg as any).code).toBe('CONFIG_ERROR');

    const g = ErrorFactory.createGeneralError('gen');
    expect((g as any).code).toBe('GENERAL_ERROR');

    const cli = ErrorFactory.createCliError('cli');
    expect((cli as any).code).toBe('CLI_ERROR');

    const sec = ErrorFactory.createSecurityError('sec');
    expect((sec as any).code).toBe('SECURITY_ERROR');
  });
});
