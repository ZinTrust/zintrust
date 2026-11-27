import { SecurePayload } from '@security/SecurePayload';
import { Schema, Validator } from '@validation/Validator';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Branch-focused coverage for SecurePayload. All decryptors are inline mocks, so
 * no real crypto or network work happens here.
 */
const decodeWith = (value: unknown) =>
  SecurePayload.decode('seed', {
    decryptor: (() => value) as never,
  });

/** A pipeline whose decrypt stage yields an arbitrary in-memory value. */
const fromValue = (value: unknown) => decodeWith(value).decrypt();

const rejectsStage = async (promise: Promise<unknown>, stage: string, message: string) => {
  await expect(promise).rejects.toThrow(`SecurePayload ${stage} failed: ${message}`);
};

describe('branch coverage: SecurePayload branches', () => {
  afterEach(() => {
    SecurePayload.clearDecryptors();
    vi.restoreAllMocks();
  });

  it('coerces booleans from native booleans, numeric sentinels, and string synonyms', async () => {
    const result = await fromValue({
      t: true,
      f: false,
      one: 1,
      zero: 0,
      yes: ' YES ',
      no: 'off',
      oneString: '1',
      noString: 'NO',
      absent: null,
      unset: undefined,
    })
      .coerce({
        t: 'boolean',
        f: 'boolean',
        one: 'boolean',
        zero: 'boolean',
        yes: 'boolean',
        no: 'boolean',
        oneString: 'boolean',
        noString: 'boolean',
        absent: 'boolean',
        unset: 'boolean',
      })
      .value();

    expect(result).toMatchObject({
      t: true,
      f: false,
      one: true,
      zero: false,
      yes: true,
      no: false,
      oneString: true,
      noString: false,
      absent: null,
    });
    expect(result).toHaveProperty('unset', undefined);
  });

  it('rejects numbers that are neither 1 nor 0 and non-scalar boolean inputs', async () => {
    await rejectsStage(
      fromValue({ flag: 42 }).coerce({ flag: 'boolean' }).value(),
      'coerce',
      'Boolean coercion failed'
    );
    await rejectsStage(
      fromValue({ flag: {} }).coerce({ flag: 'boolean' }).value(),
      'coerce',
      'Boolean coercion failed'
    );
  });

  it('covers numeric coercion of finite numbers, integers, NaN, empty strings, and bad types', async () => {
    await expect(fromValue({ n: 5 }).coerce({ n: 'number' }).value()).resolves.toEqual({ n: 5 });
    await expect(fromValue({ n: 1.5 }).coerce({ n: 'integer' }).value()).rejects.toThrow(
      /Integer coercion failed/
    );
    await expect(fromValue({ n: 2 }).coerce({ n: 'integer' }).value()).resolves.toEqual({ n: 2 });
    await expect(fromValue({ n: Number.NaN }).coerce({ n: 'number' }).value()).rejects.toThrow(
      /Numeric coercion failed/
    );
    await expect(fromValue({ n: '' }).coerce({ n: 'number' }).value()).rejects.toThrow(
      /Numeric coercion failed/
    );
    await expect(fromValue({ n: ' 12 ' }).coerce({ n: 'integer' }).value()).resolves.toEqual({
      n: 12,
    });
    await expect(fromValue({ n: {} }).coerce({ n: 'number' }).value()).rejects.toThrow(
      /Numeric coercion failed/
    );
  });

  it('coerces non-string values to strings and tolerates shape keys that are absent', async () => {
    await expect(
      fromValue({ count: 12, label: 'already-text', nested: { a: 1 } })
        .coerce({ count: 'string', label: 'string', nested: 'string', missing: 'string' })
        .value()
    ).resolves.toEqual({ count: '12', label: 'already-text', nested: '[object Object]' });
  });

  it('rejects coercion and validation of non-object payloads and reports their type', async () => {
    await rejectsStage(
      fromValue('text').coerce({ a: 'string' }).value(),
      'coerce',
      'Coercion requires a JSON object payload'
    );
    await rejectsStage(
      fromValue([1, 2]).coerce({ a: 'string' }).value(),
      'coerce',
      'Coercion requires a JSON object payload'
    );

    const schema = Schema.create().required('a').string('a');
    await rejectsStage(
      fromValue('text').validate(schema).value(),
      'validate',
      'Validation requires an object payload'
    );
    await rejectsStage(
      fromValue([1, 2]).validate(schema).value(),
      'validate',
      'Validation requires an object payload'
    );
  });

  it('normalizes non-Error schema validation failures', async () => {
    vi.resetModules();
    vi.doMock('@validation/Validator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@validation/Validator')>();
      return {
        ...actual,
        Validator: {
          validate: vi.fn(() => {
            throw 'schema blew up';
          }),
        },
      };
    });

    const { SecurePayload: MockedSecurePayload } = await import('@security/SecurePayload');
    await expect(
      MockedSecurePayload.decode('{"a":"b"}').json().validate({} as never).value()
    ).rejects.toMatchObject({
      message: expect.stringContaining('SecurePayload validate failed: Schema validation failed'),
      details: { stage: 'validate', details: { cause: 'schema blew up' } },
    });

    vi.doUnmock('@validation/Validator');
    vi.resetModules();
    expect(Validator).toBeDefined();
  });

  it('rejects json stage for non-string inputs and non-Error parse failures', async () => {
    await rejectsStage(
      fromValue(123).json().value(),
      'json',
      'JSON parsing requires a string payload'
    );

    await rejectsStage(
      SecurePayload.decode('not-json').json().value(),
      'json',
      'Invalid JSON payload'
    );
    await rejectsStage(fromValue([]).json().value(), 'json', 'JSON parsing requires a string payload');

    const originalParse = JSON.parse;
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation((text: string, reviver?: unknown) => {
      if (text === 'plain-parse-failure') throw 'parse failed without an Error';
      return originalParse(text, reviver as never);
    });

    await expect(SecurePayload.decode('plain-parse-failure').json().value()).rejects.toMatchObject({
      message: expect.stringContaining('SecurePayload json failed: Invalid JSON payload'),
      details: { stage: 'json', details: { cause: 'parse failed without an Error' } },
    });
    parseSpy.mockRestore();
  });

  it('rejects decrypt stage for non-string inputs and both Error/non-Error decryptor failures', async () => {
    await rejectsStage(
      SecurePayload.decode(['array'] as never).decrypt().value(),
      'decrypt',
      'Encrypted payload must be a string'
    );
    await rejectsStage(
      SecurePayload.decode(987 as never).decrypt().value(),
      'decrypt',
      'Encrypted payload must be a string'
    );

    await rejectsStage(
      SecurePayload.decode('cipher', {
        decryptor: () => {
          throw new Error('key unavailable');
        },
      })
        .decrypt()
        .value(),
      'decrypt',
      'key unavailable'
    );
    await rejectsStage(
      SecurePayload.decode('cipher', {
        decryptor: () => {
          throw 'plain decryptor failure';
        },
      })
        .decrypt()
        .value(),
      'decrypt',
      'Decryptor failed'
    );
  });
});
