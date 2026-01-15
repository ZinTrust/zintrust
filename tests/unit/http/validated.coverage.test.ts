import { validatedBody, validatedHeaders, validatedParams, validatedQuery } from '@http/validated';
import { describe, expect, it } from 'vitest';

describe('validated helpers coverage', () => {
  it('returns undefined when no validated data present', () => {
    const req = {} as any;
    expect(validatedBody(req)).toBeUndefined();
    expect(validatedQuery(req)).toBeUndefined();
    expect(validatedParams(req)).toBeUndefined();
    expect(validatedHeaders(req)).toBeUndefined();
  });

  it('returns validated values when present', () => {
    const req = {
      validated: {
        body: { a: 1 },
        query: { b: 2 },
        params: { c: 3 },
        headers: { d: 4 },
      },
    } as any;

    expect(validatedBody(req)).toEqual({ a: 1 });
    expect(validatedQuery(req)).toEqual({ b: 2 });
    expect(validatedParams(req)).toEqual({ c: 3 });
    expect(validatedHeaders(req)).toEqual({ d: 4 });
  });
});
