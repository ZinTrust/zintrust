import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const loggerInfo = vi.fn();
const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    info: loggerInfo,
    error: loggerError,
  },
}));

const xssEscape = vi.fn((value: string) => `escaped:${value}`);
vi.mock('@security/XssProtection', () => ({
  XssProtection: {
    escape: xssEscape,
  },
}));

class MockValidationError extends Error {
  public toObject() {
    return { field: ['invalid'] };
  }
}

const validatorValidate = vi.fn();

vi.mock('@validation/Validator', () => ({
  Validator: {
    validate: validatorValidate,
  },
  ValidationError: MockValidationError,
}));

type ReqLike = {
  getHeader: Mock;
  getMethod: Mock;
  getPath: Mock;
  isJson: Mock;
  getRaw: Mock;
  body?: unknown;
  sessionId?: string;
  user?: unknown;
};

type ResLike = {
  setHeader: Mock;
  setStatus: Mock;
  json: Mock;
  send: Mock;
  redirect: Mock;
  getStatus: Mock;
};

function createReq(overrides?: Partial<ReqLike>): ReqLike {
  return {
    getHeader: vi.fn(() => undefined),
    getMethod: vi.fn(() => 'GET'),
    getPath: vi.fn(() => '/'),
    isJson: vi.fn(() => true),
    getRaw: vi.fn(() => ({ socket: { remoteAddress: '127.0.0.1' } })),
    ...overrides,
  };
}

function createRes(): ResLike {
  const res: ResLike = {
    setHeader: vi.fn(),
    setStatus: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
    redirect: vi.fn(() => res),
    getStatus: vi.fn(() => 200),
  };
  return res;
}

describe('app/Middleware/index.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('authMiddleware: rejects missing token and allows when present', async () => {
    const { authMiddleware } = await import('@app/Middleware/index');

    const reqMissing = createReq({ getHeader: vi.fn(() => undefined) });
    const resMissing = createRes();
    const nextMissing = vi.fn().mockResolvedValue(undefined);

    await authMiddleware(reqMissing as any, resMissing as any, nextMissing);

    expect(resMissing.setStatus).toHaveBeenCalledWith(401);
    expect(resMissing.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(nextMissing).not.toHaveBeenCalled();

    const reqOk = createReq({ getHeader: vi.fn(() => 'token') });
    const resOk = createRes();
    const nextOk = vi.fn().mockResolvedValue(undefined);

    await authMiddleware(reqOk as any, resOk as any, nextOk);

    expect(nextOk).toHaveBeenCalledTimes(1);
  });

  it('corsMiddleware: sets headers and handles OPTIONS', async () => {
    const { corsMiddleware } = await import('@app/Middleware/index');

    const reqOptions = createReq({ getMethod: vi.fn(() => 'OPTIONS') });
    const resOptions = createRes();
    const nextOptions = vi.fn().mockResolvedValue(undefined);

    await corsMiddleware(reqOptions as any, resOptions as any, nextOptions);

    expect(resOptions.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(resOptions.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    expect(resOptions.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    expect(resOptions.setStatus).toHaveBeenCalledWith(200);
    expect(resOptions.send).toHaveBeenCalledWith('');
    expect(nextOptions).not.toHaveBeenCalled();

    const reqGet = createReq({ getMethod: vi.fn(() => 'GET') });
    const resGet = createRes();
    const nextGet = vi.fn().mockResolvedValue(undefined);

    await corsMiddleware(reqGet as any, resGet as any, nextGet);

    expect(nextGet).toHaveBeenCalledTimes(1);
  });

  it('jsonMiddleware: skips GET/DELETE, rejects non-json otherwise', async () => {
    const { jsonMiddleware } = await import('@app/Middleware/index');

    const reqGet = createReq({ getMethod: vi.fn(() => 'GET') });
    const resGet = createRes();
    const nextGet = vi.fn().mockResolvedValue(undefined);

    await jsonMiddleware(reqGet as any, resGet as any, nextGet);

    expect(nextGet).toHaveBeenCalledTimes(1);

    const reqPostNotJson = createReq({
      getMethod: vi.fn(() => 'POST'),
      isJson: vi.fn(() => false),
    });
    const resPostNotJson = createRes();
    const nextPostNotJson = vi.fn().mockResolvedValue(undefined);

    await jsonMiddleware(reqPostNotJson as any, resPostNotJson as any, nextPostNotJson);

    expect(resPostNotJson.setStatus).toHaveBeenCalledWith(415);
    expect(resPostNotJson.json).toHaveBeenCalledWith({
      error: 'Content-Type must be application/json',
    });
    expect(nextPostNotJson).not.toHaveBeenCalled();

    const reqPostJson = createReq({ getMethod: vi.fn(() => 'POST'), isJson: vi.fn(() => true) });
    const resPostJson = createRes();
    const nextPostJson = vi.fn().mockResolvedValue(undefined);

    await jsonMiddleware(reqPostJson as any, resPostJson as any, nextPostJson);

    expect(nextPostJson).toHaveBeenCalledTimes(1);
  });

  it('loggingMiddleware: logs before and after', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));

    const { loggingMiddleware } = await import('@app/Middleware/index');

    const req = createReq({ getMethod: vi.fn(() => 'GET'), getPath: vi.fn(() => '/ping') });
    const res = createRes();

    const next = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date('2020-01-01T00:00:00.010Z'));
    });

    await loggingMiddleware(req as any, res as any, next);

    expect(loggerInfo).toHaveBeenCalledWith('→ GET /ping');
    expect(loggerInfo).toHaveBeenCalledWith('← 200 GET /ping (10ms)');

    vi.useRealTimers();
  });

  it('rateLimitMiddleware: tracks counts, defaults unknown ip, and blocks when over limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));

    const { rateLimitMiddleware } = await import('@app/Middleware/index');

    const reqUnknownIp = createReq({
      getRaw: vi.fn(() => ({ socket: { remoteAddress: undefined } })),
      getMethod: vi.fn(() => 'GET'),
    });

    const next = vi.fn().mockResolvedValue(undefined);

    // First call initializes storage for 'unknown'
    await rateLimitMiddleware(reqUnknownIp as any, createRes() as any, next);

    // Second call hits the "has(ip) === true" branch
    await rateLimitMiddleware(reqUnknownIp as any, createRes() as any, next);

    // Now call enough times to exceed maxRequests (100)
    for (let i = 0; i < 98; i += 1) {
      await rateLimitMiddleware(reqUnknownIp as any, createRes() as any, next);
    }

    const resBlocked = createRes();
    const nextBlocked = vi.fn().mockResolvedValue(undefined);

    await rateLimitMiddleware(reqUnknownIp as any, resBlocked as any, nextBlocked);

    expect(resBlocked.setStatus).toHaveBeenCalledWith(429);
    expect(resBlocked.json).toHaveBeenCalledWith({ error: 'Too many requests' });
    expect(nextBlocked).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('rateLimitMiddleware: uses fallback when Map.get returns undefined', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));

    const originalGet = Map.prototype.get;
    const getSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown
    ) {
      if (key === 'mock-ip') return undefined;
      return originalGet.call(this, key);
    });

    const { rateLimitMiddleware } = await import('@app/Middleware/index');

    const req = createReq({
      getRaw: vi.fn(() => ({ socket: { remoteAddress: 'mock-ip' } })),
      getMethod: vi.fn(() => 'GET'),
    });
    const res = createRes();
    const next = vi.fn().mockResolvedValue(undefined);

    await rateLimitMiddleware(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setStatus).not.toHaveBeenCalled();

    getSpy.mockRestore();
    vi.useRealTimers();
  });

  it('trailingSlashMiddleware: redirects trailing slash and passes through otherwise', async () => {
    const { trailingSlashMiddleware } = await import('@app/Middleware/index');

    const reqRedirect = createReq({ getPath: vi.fn(() => '/abc/') });
    const resRedirect = createRes();
    const nextRedirect = vi.fn().mockResolvedValue(undefined);

    await trailingSlashMiddleware(reqRedirect as any, resRedirect as any, nextRedirect);

    expect(resRedirect.redirect).toHaveBeenCalledWith('/abc', 301);
    expect(nextRedirect).not.toHaveBeenCalled();

    const reqOk = createReq({ getPath: vi.fn(() => '/') });
    const resOk = createRes();
    const nextOk = vi.fn().mockResolvedValue(undefined);

    await trailingSlashMiddleware(reqOk as any, resOk as any, nextOk);

    expect(nextOk).toHaveBeenCalledTimes(1);
  });

  it('jwtMiddleware: handles missing header, invalid format, verification ok, and verification failure', async () => {
    const { jwtMiddleware } = await import('@app/Middleware/index');

    const jwtManager = {
      verify: vi.fn(() => ({ sub: '1' })),
    };

    const handler = jwtMiddleware(jwtManager as any, 'HS256');

    const resMissing = createRes();
    await handler(
      createReq({ getHeader: vi.fn(() => undefined) }) as any,
      resMissing as any,
      vi.fn()
    );
    expect(resMissing.setStatus).toHaveBeenCalledWith(401);
    expect(resMissing.json).toHaveBeenCalledWith({ error: 'Missing authorization header' });

    const resBad = createRes();
    await handler(
      createReq({ getHeader: vi.fn(() => 'Basic abc') }) as any,
      resBad as any,
      vi.fn()
    );
    expect(resBad.setStatus).toHaveBeenCalledWith(401);
    expect(resBad.json).toHaveBeenCalledWith({ error: 'Invalid authorization header format' });

    const reqOk = createReq({ getHeader: vi.fn(() => 'Bearer good') });
    const resOk = createRes();
    const nextOk = vi.fn().mockResolvedValue(undefined);

    await handler(reqOk as any, resOk as any, nextOk);

    expect(jwtManager.verify).toHaveBeenCalledWith('good', 'HS256');
    expect((reqOk as any).user).toEqual({ sub: '1' });
    expect(nextOk).toHaveBeenCalledTimes(1);

    const jwtManagerFail = {
      verify: vi.fn(() => {
        throw new Error('bad');
      }),
    };

    const handlerFail = jwtMiddleware(jwtManagerFail as any, 'RS256');
    const resFail = createRes();

    await handlerFail(
      createReq({ getHeader: vi.fn(() => 'Bearer bad') }) as any,
      resFail as any,
      vi.fn()
    );

    expect(loggerError).toHaveBeenCalledWith('JWT verification failed:', expect.any(Error));
    expect(resFail.setStatus).toHaveBeenCalledWith(401);
    expect(resFail.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('csrfMiddleware: skips non-state-changing, validates, and errors for missing/invalid tokens', async () => {
    const { csrfMiddleware } = await import('@app/Middleware/index');

    const csrfManager = {
      validateToken: vi.fn(() => true),
    };

    const handler = csrfMiddleware(csrfManager as any);

    const nextSkip = vi.fn().mockResolvedValue(undefined);
    await handler(
      createReq({ getMethod: vi.fn(() => 'GET') }) as any,
      createRes() as any,
      nextSkip
    );
    expect(nextSkip).toHaveBeenCalledTimes(1);

    const resNoSession = createRes();
    await handler(
      createReq({ getMethod: vi.fn(() => 'POST'), getHeader: vi.fn(() => undefined) }) as any,
      resNoSession as any,
      vi.fn()
    );
    expect(resNoSession.setStatus).toHaveBeenCalledWith(400);
    expect(resNoSession.json).toHaveBeenCalledWith({ error: 'Missing session ID' });

    const resNoCsrf = createRes();
    const reqNoCsrf = createReq({
      getMethod: vi.fn(() => 'POST'),
      sessionId: 'sess',
      getHeader: vi.fn(() => undefined),
    });
    await handler(reqNoCsrf as any, resNoCsrf as any, vi.fn());
    expect(resNoCsrf.setStatus).toHaveBeenCalledWith(403);
    expect(resNoCsrf.json).toHaveBeenCalledWith({ error: 'Missing CSRF token' });

    const csrfManagerInvalid = {
      validateToken: vi.fn(() => false),
    };
    const handlerInvalid = csrfMiddleware(csrfManagerInvalid as any);

    const resInvalid = createRes();
    const reqInvalid = createReq({
      getMethod: vi.fn(() => 'POST'),
      getHeader: vi.fn((name: string) => {
        if (name === 'x-session-id') return 'sess';
        if (name === 'x-csrf-token') return 'csrf';
        return undefined;
      }),
    });

    await handlerInvalid(reqInvalid as any, resInvalid as any, vi.fn());

    expect(csrfManagerInvalid.validateToken).toHaveBeenCalledWith('sess', 'csrf');
    expect(resInvalid.setStatus).toHaveBeenCalledWith(403);
    expect(resInvalid.json).toHaveBeenCalledWith({ error: 'Invalid or expired CSRF token' });

    const resOk = createRes();
    const nextOk = vi.fn().mockResolvedValue(undefined);
    const reqOk = createReq({
      getMethod: vi.fn(() => 'POST'),
      getHeader: vi.fn((name: string) => {
        if (name === 'x-session-id') return 'sess';
        if (name === 'x-csrf-token') return 'csrf';
        return undefined;
      }),
    });

    await handler(reqOk as any, resOk as any, nextOk);

    expect(csrfManager.validateToken).toHaveBeenCalledWith('sess', 'csrf');
    expect(nextOk).toHaveBeenCalledTimes(1);
  });

  it('validationMiddleware: skips GET/DELETE, validates ok, and handles ValidationError vs other error', async () => {
    const { validationMiddleware } = await import('@app/Middleware/index');

    const schema = { getRules: vi.fn(() => ({})) };
    const handler = validationMiddleware(schema as any);

    const nextSkip = vi.fn().mockResolvedValue(undefined);
    await handler(
      createReq({ getMethod: vi.fn(() => 'GET') }) as any,
      createRes() as any,
      nextSkip
    );
    expect(nextSkip).toHaveBeenCalledTimes(1);

    validatorValidate.mockImplementationOnce(() => undefined);

    const reqOk = createReq({ getMethod: vi.fn(() => 'POST'), body: { a: 1 } });
    const resOk = createRes();
    const nextOk = vi.fn().mockResolvedValue(undefined);

    await handler(reqOk as any, resOk as any, nextOk);

    expect(validatorValidate).toHaveBeenCalled();
    expect(nextOk).toHaveBeenCalledTimes(1);

    validatorValidate.mockImplementationOnce(() => undefined);

    const reqUndefinedBody = createReq({ getMethod: vi.fn(() => 'POST') });
    const resUndefinedBody = createRes();
    const nextUndefinedBody = vi.fn().mockResolvedValue(undefined);

    await handler(reqUndefinedBody as any, resUndefinedBody as any, nextUndefinedBody);

    expect(validatorValidate).toHaveBeenCalledWith({}, expect.anything());
    expect(nextUndefinedBody).toHaveBeenCalledTimes(1);

    validatorValidate.mockImplementationOnce(() => {
      throw new MockValidationError('bad');
    });

    const resValErr = createRes();
    await handler(
      createReq({ getMethod: vi.fn(() => 'POST'), body: {} }) as any,
      resValErr as any,
      vi.fn()
    );

    expect(loggerError).toHaveBeenCalledWith('Validation error:', expect.any(Error));
    expect(resValErr.setStatus).toHaveBeenCalledWith(422);
    expect(resValErr.json).toHaveBeenCalledWith({ errors: { field: ['invalid'] } });

    validatorValidate.mockImplementationOnce(() => {
      throw new Error('other');
    });

    const resOther = createRes();
    await handler(
      createReq({ getMethod: vi.fn(() => 'POST'), body: {} }) as any,
      resOther as any,
      vi.fn()
    );

    expect(resOther.setStatus).toHaveBeenCalledWith(400);
    expect(resOther.json).toHaveBeenCalledWith({ error: 'Invalid request body' });
  });

  it('xssProtectionMiddleware: sets headers and escapes string fields only', async () => {
    const { xssProtectionMiddleware } = await import('@app/Middleware/index');

    const next = vi.fn().mockResolvedValue(undefined);
    const req = createReq({
      getMethod: vi.fn(() => 'POST'),
      body: {
        safe: 123,
        name: '<script>',
      },
    });

    const res = createRes();

    await xssProtectionMiddleware(req as any, res as any, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');

    expect(xssEscape).toHaveBeenCalledWith('<script>');
    expect((req as any).body.name).toBe('escaped:<script>');

    expect(next).toHaveBeenCalledTimes(1);

    const reqNoBody = createReq({ body: undefined });
    await xssProtectionMiddleware(
      reqNoBody as any,
      createRes() as any,
      vi.fn().mockResolvedValue(undefined)
    );
  });
});
