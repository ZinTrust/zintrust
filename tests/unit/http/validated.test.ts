import type { IRequest } from '@http/Request';
import {
  Validated,
  validatedBody,
  validatedHeaders,
  validatedParams,
  validatedQuery,
} from '@http/validated';
import { describe, expect, it } from 'vitest';

type ValidatedShape = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
};

const makeReq = (validated?: ValidatedShape): IRequest => {
  return { validated } as unknown as IRequest;
};

describe('validated helpers', () => {
  it('returns undefined when req.validated missing', () => {
    const req = makeReq(undefined);

    expect(validatedBody(req)).toBeUndefined();
    expect(validatedQuery(req)).toBeUndefined();
    expect(validatedParams(req)).toBeUndefined();
    expect(validatedHeaders(req)).toBeUndefined();
  });

  it('returns undefined when specific part missing', () => {
    const req = makeReq({ body: { a: 1 } });

    expect(validatedBody(req)).toEqual({ a: 1 });
    expect(validatedQuery(req)).toBeUndefined();
    expect(validatedParams(req)).toBeUndefined();
    expect(validatedHeaders(req)).toBeUndefined();
  });

  it('Validated namespace delegates', () => {
    const req = makeReq({
      body: { b: 2 },
      query: { q: '1' },
      params: { id: 'x' },
      headers: { accept: 'application/json' },
    });

    expect(Validated.body(req)).toEqual({ b: 2 });
    expect(Validated.query(req)).toEqual({ q: '1' });
    expect(Validated.params(req)).toEqual({ id: 'x' });
    expect(Validated.headers(req)).toEqual({ accept: 'application/json' });
  });
});
