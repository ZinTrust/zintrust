import type { IRequest } from '@http/Request';
import {
  getValidatedBody,
  getValidatedHeaders,
  getValidatedParams,
  getValidatedQuery,
  hasValidatedBody,
  requireValidatedBody,
} from '@http/ValidationHelper';
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

describe('ValidationHelper', () => {
  it('getters return undefined when missing', () => {
    const req = makeReq(undefined);

    expect(getValidatedBody(req)).toBeUndefined();
    expect(getValidatedQuery(req)).toBeUndefined();
    expect(getValidatedParams(req)).toBeUndefined();
    expect(getValidatedHeaders(req)).toBeUndefined();
    expect(hasValidatedBody(req)).toBe(false);
  });

  it('getters return values when present', () => {
    const req = makeReq({
      body: { a: 1 },
      query: { q: 'x' },
      params: { id: 2 },
      headers: { 'x-test': '1' },
    });

    expect(getValidatedBody(req)).toEqual({ a: 1 });
    expect(getValidatedQuery(req)).toEqual({ q: 'x' });
    expect(getValidatedParams(req)).toEqual({ id: 2 });
    expect(getValidatedHeaders(req)).toEqual({ 'x-test': '1' });
    expect(hasValidatedBody(req)).toBe(true);
  });

  it('requireValidatedBody throws when missing', () => {
    const req = makeReq({ query: { q: 1 } });
    expect(() => requireValidatedBody(req)).toThrow();
  });

  it('requireValidatedBody returns body when present', () => {
    const req = makeReq({ body: { ok: true } });
    expect(requireValidatedBody(req)).toEqual({ ok: true });
  });
});
