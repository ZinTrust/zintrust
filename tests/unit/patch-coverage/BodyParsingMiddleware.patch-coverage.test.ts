import { bodyParsingMiddleware } from '@http/middleware/BodyParsingMiddleware';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { describe, expect, it, vi } from 'vitest';

const makeRes = (): IResponse & {
  _status: number;
  _json: unknown;
} => {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    setStatus(code: number) {
      res._status = code;
      return res;
    },
    getStatus(): number {
      return res._status;
    },
    json(payload: unknown) {
      res._json = payload;
      return res;
    },
  } as unknown as IResponse & { _status: number; _json: unknown };

  return res;
};

describe('patch coverage: BodyParsingMiddleware', () => {
  it('handles mocked string/buffer/object bodies and JSON parse failures', async () => {
    const next = vi.fn(async () => undefined);

    // Invalid JSON from mocked string body
    // Invalid JSON from mocked string body
    process.env['MAX_JSON_SIZE'] = '1024';
    const req1 = {
      context: {},
      getHeader: () => 'application/json',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({ body: 'not-json' }),
    } as unknown as IRequest;
    const res1 = makeRes();

    await bodyParsingMiddleware(req1, res1, next);
    expect(res1.getStatus()).toBe(400);
    expect(res1._json).toEqual({ error: 'Invalid JSON body' });

    // Valid JSON from mocked buffer body
    const req2 = {
      context: {},
      getHeader: () => 'application/json',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({ body: Buffer.from('{"ok":true}', 'utf-8') }),
    } as unknown as IRequest;
    const res2 = makeRes();

    await bodyParsingMiddleware(req2, res2, next);
    expect(req2.setBody).toHaveBeenCalledWith({ ok: true });

    // Valid JSON from mocked object body
    const req3 = {
      context: {},
      getHeader: () => 'application/json',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({ body: { hello: 'world' } }),
    } as unknown as IRequest;
    const res3 = makeRes();

    await bodyParsingMiddleware(req3, res3, next);
    expect(req3.setBody).toHaveBeenCalledWith({ hello: 'world' });
  });

  it('returns 413 when mocked body exceeds max size', async () => {
    const next = vi.fn(async () => undefined);

    process.env['MAX_JSON_SIZE'] = '1';
    const req = {
      context: {},
      getHeader: () => 'application/json',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({ body: '{}' }),
    } as unknown as IRequest;
    const res = makeRes();

    await bodyParsingMiddleware(req, res, next);
    expect(res.getStatus()).toBe(413);
    expect(res._json).toEqual({ error: 'Payload Too Large' });
  });

  it('handles mocked object that cannot be JSON-stringified', async () => {
    const next = vi.fn(async () => undefined);

    process.env['MAX_JSON_SIZE'] = '1024';
    const circular: any = { a: 1 };
    circular.self = circular;

    const req = {
      context: {},
      getHeader: () => 'application/json',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({ body: circular }),
    } as unknown as IRequest;
    const res = makeRes();

    await bodyParsingMiddleware(req, res, next);
    expect(res.getStatus()).toBe(400);
    expect(res._json).toEqual({ error: 'Invalid request body' });
  });

  it('reads from async iterable stream, including fallback chunk coercion and size destroy', async () => {
    const next = vi.fn(async () => undefined);

    // Stream path where chunks include a number (fallback String(chunk))
    // Stream path where chunks include a number (fallback String(chunk))
    process.env['MAX_JSON_SIZE'] = '1024';

    const streamOk = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('hello ');
        yield new Uint8Array([119, 111, 114, 108, 100]); // "world"
        yield 5; // hits String(chunk) fallback
      },
    };

    const reqText = {
      context: {},
      getHeader: () => 'text/plain',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => streamOk,
    } as unknown as IRequest;
    const resText = makeRes();

    await bodyParsingMiddleware(reqText, resText, next);
    expect(reqText.setBody).toHaveBeenCalled();

    // Stream path where maxBytes is exceeded and destroy() is called
    // Stream path where maxBytes is exceeded and destroy() is called
    process.env['MAX_JSON_SIZE'] = '1';
    const destroy = vi.fn();
    const streamTooBig = {
      destroy,
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('xx');
      },
    };

    const reqTooBig = {
      context: {},
      getHeader: () => 'application/json',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => streamTooBig,
    } as unknown as IRequest;
    const resTooBig = makeRes();

    await bodyParsingMiddleware(reqTooBig, resTooBig, next);
    expect(destroy).toHaveBeenCalled();
    expect(resTooBig.getStatus()).toBe(413);
  });

  it('reuses existing rawBodyBytes/rawBodyText and parses urlencoded duplicates + binary bodies', async () => {
    const next = vi.fn(async () => undefined);

    // Reuse existing rawBodyBytes (buffer branch)
    const reqExistingBytes = {
      context: { rawBodyBytes: Buffer.from('hi', 'utf-8') },
      getHeader: () => 'text/plain',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({}) as any,
    } as unknown as IRequest;
    const resExistingBytes = makeRes();

    await bodyParsingMiddleware(reqExistingBytes, resExistingBytes, next);
    expect(reqExistingBytes.context['rawBodyText']).toBe('hi');

    // Reuse existing rawBodyText (string branch)
    const reqExistingText = {
      context: { rawBodyText: 'hello' },
      getHeader: () => 'text/plain',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({}) as any,
    } as unknown as IRequest;
    const resExistingText = makeRes();

    await bodyParsingMiddleware(reqExistingText, resExistingText, next);
    expect(Buffer.isBuffer(reqExistingText.context['rawBodyBytes'])).toBe(true);

    // URL-encoded duplicate keys should aggregate into arrays (hits existing.push branch)
    const reqUrlEncoded = {
      context: {},
      getHeader: () => 'application/x-www-form-urlencoded',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => ({ body: 'a=1&a=2&a=3' }),
    } as unknown as IRequest;
    const resUrlEncoded = makeRes();
    await bodyParsingMiddleware(reqUrlEncoded, resUrlEncoded, next);
    expect(reqUrlEncoded.setBody).toHaveBeenCalledWith({ a: ['1', '2', '3'] });

    // Unknown but non-empty content-type should set body as bytes
    const streamBinary = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      },
    };

    const reqBinary = {
      context: {},
      getHeader: () => 'application/octet-stream',
      getMethod: () => 'POST',
      getBody: () => undefined,
      setBody: vi.fn(),
      getRaw: () => streamBinary,
    } as unknown as IRequest;
    const resBinary = makeRes();

    await bodyParsingMiddleware(reqBinary, resBinary, next);
    expect(Buffer.isBuffer((reqBinary.setBody as any).mock.calls[0][0])).toBe(true);
  });
});
