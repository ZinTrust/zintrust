import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationMiddleware } from '../../src/middleware/ValidationMiddleware';
import { Schema } from '../../src/validation/Validator';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ValidationMiddleware.create', () => {
  it('uses request body when getBody provided and req.body empty', async () => {
    const middleware = ValidationMiddleware.create(Schema.create());

    let nextCalled = false;
    const req: any = {
      getMethod: () => 'POST',
      getBody: () => ({ name: 'Alice' }),
      body: {},
      setBody: (b: any) => {
        req.body = b;
      },
      validated: {},
    };

    const res = {} as any;

    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.validated.body).toEqual({ name: 'Alice' });
    expect(req.body).toEqual({ name: 'Alice' });
  });
});

describe('ValidationMiddleware.createBodyWithSanitization', () => {
  it('applies field sanitizers before validation', async () => {
    const schema = Schema.create();
    const middleware = ValidationMiddleware.createBodyWithSanitization(schema, {
      name: (v: any) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
    });

    let nextCalled = false;
    const req: any = {
      getMethod: () => 'POST',
      getBody: () => ({ name: ' alice ' }),
      body: {},
      setBody: (b: any) => {
        req.body = b;
      },
      validated: {},
    };

    const res = {} as any;

    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.validated.body).toEqual({ name: 'ALICE' });
  });

  it('returns 400 when sanitizer throws SanitizerError in bulletproof variant', async () => {
    const schema = Schema.create();
    const sanitizerErr: any = new Error('Bad');
    sanitizerErr.name = 'SanitizerError';

    const middleware = ValidationMiddleware.createBodyWithBulletproofSanitization(schema, {
      email: () => {
        throw sanitizerErr;
      },
    });

    let nextCalled = false;
    const req: any = {
      getMethod: () => 'POST',
      getBody: () => ({ email: 'x' }),
      body: {},
      setBody: (b: any) => {
        req.body = b;
      },
      validated: {},
    };

    const res: any = {
      setStatus: (s: number) => ({ json: (p: any) => (res.payload = { status: s, body: p }) }),
    };

    await middleware(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.payload.status).toBe(422);
    expect(res.payload.body).toEqual({ errors: { sanitization: [sanitizerErr.message] } });
  });
});
