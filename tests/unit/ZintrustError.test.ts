import { createSanitizerError, Errors, initZintrustError } from '@exceptions/ZintrustError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ZinTrustError helpers', () => {
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

  it('createSanitizerError handles symbol values', () => {
    const sym = Symbol('test');
    const err = createSanitizerError('foo', 'reason', sym);
    expect((err as any).details?.redactedValue).toBe('Symbol');
  });

  it('createSanitizerError handles function values', () => {
    const fn = () => {};
    const err = createSanitizerError('foo', 'reason', fn);
    expect((err as any).details?.redactedValue).toBe('Function');
  });

  it('createSanitizerError handles Buffer values', () => {
    const buf = Buffer.from('test');
    const err = createSanitizerError('foo', 'reason', buf);
    expect((err as any).details?.redactedValue).toMatch(/Buffer\(len=\d+\)/);
  });

  it('createSanitizerError handles Uint8Array values', () => {
    const arr = new Uint8Array([1, 2, 3]);
    const err = createSanitizerError('foo', 'reason', arr);
    expect((err as any).details?.redactedValue).toMatch(/Uint8Array\(len=\d+\)/);
  });

  it('createSanitizerError handles Array values', () => {
    const arr = [1, 2, 3];
    const err = createSanitizerError('foo', 'reason', arr);
    expect((err as any).details?.redactedValue).toMatch(/Array\(len=\d+\)/);
  });

  it('createSanitizerError handles Object values', () => {
    const obj = { foo: 'bar' };
    const err = createSanitizerError('foo', 'reason', obj);
    expect((err as any).details?.redactedValue).toBe('Object');
  });

  it('createSanitizerError truncates non-object values', () => {
    const num = 12345;
    const err = createSanitizerError('foo', 'reason', num);
    expect((err as any).details?.redactedValue).toContain('12345');
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
