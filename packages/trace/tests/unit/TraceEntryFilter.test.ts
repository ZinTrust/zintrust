import { describe, expect, it } from 'vitest';

import { TraceConfig } from '../../src/config';
import type { ITraceEntry } from '../../src/types';
import { EntryType } from '../../src/types';
import { TraceEntryFilter } from '../../src/utils/entryFilter';

const createEntry = (
  type: ITraceEntry['type'],
  content: Record<string, unknown>,
  tags: string[] = []
): ITraceEntry => ({
  uuid: 'entry-1',
  batchId: 'batch-1',
  type,
  content,
  tags,
  isLatest: true,
  createdAt: 1,
});

describe('TraceEntryFilter', () => {
  it('supports contains-based request method exclusions', () => {
    const config = TraceConfig.merge({
      watchers: {
        request: {
          get: { exclude: ['report'] },
        },
      },
    });

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.REQUEST, {
          method: 'GET',
          uri: '/api/reports/daily',
          payload: {},
        }),
        config
      )
    ).toBe(false);

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.REQUEST, {
          method: 'GET',
          uri: '/api/users',
          payload: {},
        }),
        config
      )
    ).toBe(true);
  });

  it('supports contains-based request method includes', () => {
    const config = TraceConfig.merge({
      watchers: {
        request: {
          post: { include: ['auth'] },
        },
      },
    });

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.REQUEST, {
          method: 'POST',
          uri: '/api/auth/login',
          payload: { email: 'a@b.c' },
        }),
        config
      )
    ).toBe(true);

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.REQUEST, {
          method: 'POST',
          uri: '/api/reports',
          payload: {},
        }),
        config
      )
    ).toBe(false);
  });

  it('applies contains-based filters to other trace types', () => {
    const config = TraceConfig.merge({
      watchers: {
        log: { exclude: ['healthcheck'] },
        exception: { include: ['trace'] },
      },
    });

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.LOG, {
          level: 'info',
          message: 'healthcheck ok',
        }),
        config
      )
    ).toBe(false);

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.EXCEPTION, {
          class: 'TypeError',
          message: 'trace pipeline exploded',
        }),
        config
      )
    ).toBe(true);

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.EXCEPTION, {
          class: 'TypeError',
          message: 'plain failure',
        }),
        config
      )
    ).toBe(false);
  });

  it('supports per-source client request filters', () => {
    const config = TraceConfig.merge({
      watchers: {
        clientRequest: {
          include: ['https://'],
          sources: {
            termii: { enabled: false },
            sendgrid: { include: ['sendgrid.com'] },
          },
        },
      },
    });

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.CLIENT_REQUEST, {
          source: 'termii',
          method: 'POST',
          url: 'https://api.termii.com/sms/send',
        }),
        config
      )
    ).toBe(false);

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.CLIENT_REQUEST, {
          source: 'sendgrid',
          method: 'POST',
          url: 'https://api.sendgrid.com/v3/mail/send',
        }),
        config
      )
    ).toBe(true);

    expect(
      TraceEntryFilter.shouldCapture(
        createEntry(EntryType.CLIENT_REQUEST, {
          source: 'sendgrid',
          method: 'POST',
          url: 'https://example.test/fallback',
        }),
        config
      )
    ).toBe(false);
  });
});
