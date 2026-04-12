import { afterEach, describe, expect, it, vi } from 'vitest';

import { listEntries, setHandlerStorage } from '../../src/dashboard/handlers';
import type { ITraceStorage } from '../../src/types';

const createResponse = () => {
  const response = {
    status: 200,
    payload: undefined as unknown,
    setStatus: vi.fn(function setStatus(this: { status: number }, status: number) {
      this.status = status;
      return this;
    }),
    json: vi.fn(function json(this: { payload: unknown }, payload: unknown) {
      this.payload = payload;
      return this;
    }),
  };

  return response;
};

describe('dashboard listEntries', () => {
  afterEach(() => {
    setHandlerStorage(null as unknown as ITraceStorage);
  });

  it('returns compact list entries and caps heavy request pages', async () => {
    const queryEntries = vi.fn(async () => ({
      data: [
        {
          uuid: 'entry-1',
          batchId: 'batch-1',
          type: 'request' as const,
          content: {
            method: 'POST',
            uri: '/api/tasks',
            responseStatus: 201,
            duration: 143,
            hostname: 'app-node',
            middleware: ['auth', 'throttle'],
            payload: { large: 'x'.repeat(2048) },
            responseBody: { nested: 'y'.repeat(2048) },
          },
          tags: ['api'],
          isLatest: true,
          createdAt: 1,
        },
      ],
      total: 1,
    }));

    setHandlerStorage({
      queryEntries,
    } as unknown as ITraceStorage);

    const request = {
      getQueryParam: vi.fn((key: string) => {
        if (key === 'type') return 'request';
        if (key === 'perPage') return '200';
        if (key === 'page') return '1';
        return undefined;
      }),
    };
    const response = createResponse();

    await listEntries(request as never, response as never);

    expect(queryEntries).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'request', perPage: 50, page: 1 })
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        total: 1,
        perPage: 50,
        data: [
          expect.objectContaining({
            uuid: 'entry-1',
            hasDetails: true,
            contentBytes: expect.any(Number),
            content: expect.objectContaining({
              method: 'POST',
              uri: '/api/tasks',
              responseStatus: 201,
            }),
          }),
        ],
      })
    );

    const payload = response.payload as { data: Array<{ content: Record<string, unknown> }> };
    expect(payload.data[0].content).not.toHaveProperty('payload');
    expect(payload.data[0].content).not.toHaveProperty('responseBody');
  });
});
