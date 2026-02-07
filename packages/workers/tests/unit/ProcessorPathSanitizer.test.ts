import { describe, expect, it, vi } from 'vitest';

import { withProcessorPathValidation } from '../../src/http/middleware/ProcessorPathSanitizer';

type TestResponse = {
  statusCode: number;
  payload?: Record<string, unknown>;
  setStatus: (code: number) => TestResponse;
  json: (payload: Record<string, unknown>) => TestResponse;
};

const createResponse = (): TestResponse => {
  return {
    statusCode: 200,
    setStatus(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.payload = payload;
      return this;
    },
  };
};

const createRequest = (body: Record<string, unknown>) => {
  let currentBody = { ...body };
  return {
    data: () => currentBody,
    getBody: () => currentBody,
    setBody: (next: Record<string, unknown>) => {
      currentBody = next;
    },
  } as unknown;
};

describe('ProcessorPathSanitizer', () => {
  it('accepts valid processor path', async () => {
    const handler = vi.fn(async () => undefined);
    const middleware = withProcessorPathValidation(handler);
    const req = createRequest({ processor: 'processors/email-sender.js' });
    const res = createResponse();

    await middleware(req as never, res as never);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('rejects path traversal', async () => {
    const handler = vi.fn(async () => undefined);
    const middleware = withProcessorPathValidation(handler);
    const req = createRequest({ processor: '../secrets.js' });
    const res = createResponse();

    await middleware(req as never, res as never);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload?.code).toBe('INVALID_PROCESSOR_PATH');
  });

  it('accepts allowlisted url spec', async () => {
    const handler = vi.fn(async () => undefined);
    const middleware = withProcessorPathValidation(handler);
    const req = createRequest({ processor: 'https://wk.zintrust.com/app/EmailWorker.js' });
    const res = createResponse();

    await middleware(req as never, res as never);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('rejects non-allowlisted url spec', async () => {
    const handler = vi.fn(async () => undefined);
    const middleware = withProcessorPathValidation(handler);
    const req = createRequest({ processor: 'https://example.com/app/EmailWorker.js' });
    const res = createResponse();

    await middleware(req as never, res as never);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload?.code).toBe('INVALID_PROCESSOR_URL_HOST');
  });
});
