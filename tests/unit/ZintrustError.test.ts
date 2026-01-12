import { createSanitizerError, Errors, initZintrustError } from '@exceptions/ZintrustError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ZintrustError helpers', () => {
  it('initZintrustError applies properties', () => {
    const e = new Error('boom');
    initZintrustError(e, { name: 'MyErr', statusCode: 418, code: 'I_AM', details: { foo: 'bar' } });

    expect(e.name).toBe('MyErr');
    expect((e as any).statusCode).toBe(418);
    expect((e as any).code).toBe('I_AM');
    expect((e as any).details).toEqual({ foo: 'bar' });
  });

  it('createSanitizerError redacts long values', () => {
    const long = 'x'.repeat(200);
    const err = createSanitizerError('foo', 'reason', long);
    expect(err.message).toContain('Sanitizer.foo() failed');
    expect((err as any).details?.redactedValue).toMatch(/\.\.\./);
  });

  it('createTryCatchError logs via Logger.error', async () => {
    vi.resetModules();
    const errorSpy = vi.fn();
    vi.doMock('@config/logger', () => ({ Logger: { error: errorSpy } }));

    const { createTryCatchError } = await import('@exceptions/ZintrustError');

    const err = createTryCatchError('failed', { hey: 'ho' });

    expect(errorSpy).toHaveBeenCalled();
    expect(err.message).toBe('failed');
  });

  it('Errors.sanitizer returns proper error', () => {
    const err = Errors.sanitizer('m', 'r', 'v');
    expect(err.message).toContain('Sanitizer.m() failed');
  });
});
