import { afterEach, describe, expect, it, vi } from 'vitest';

import { listEntries, setHandlerStorage } from '../../src/dashboard/handlers';
import { buildDashboardHtml } from '../../src/dashboard/ui';
import { TraceStorage } from '../../src/storage/TraceStorage';
import type { ITraceStorage } from '../../src/types';

const createResponse = () => ({
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
});

const createQueryParamRequest = (params: Record<string, string>) => ({
  getQueryParam: vi.fn((key: string) => params[key]),
});

const createSearchDb = (driver = 'sqlite') => {
  const query = vi.fn(async () => []);
  const queryOne = vi.fn(async () => ({ cnt: 1 }));
  return {
    db: {
      execute: vi.fn(async () => undefined),
      getType: vi.fn(() => driver),
      query,
      queryOne,
    },
    query,
    queryOne,
  };
};

const findCall = (
  mock: { mock: { calls: unknown[][] } },
  needle: string
): [string, unknown[]] => {
  const call = mock.mock.calls.find((args) => String(args[0]).includes(needle));
  return (call ?? ['', []]) as [string, unknown[]];
};

describe('trace search handler parsing', () => {
  afterEach(() => {
    setHandlerStorage(null as unknown as ITraceStorage);
  });

  it('passes the search term and only known, deduplicated search fields to storage', async () => {
    const queryEntries = vi.fn(async () => ({ data: [], total: 0 }));
    setHandlerStorage({ queryEntries } as unknown as ITraceStorage);

    await listEntries(
      createQueryParamRequest({
        search: '  timeout  ',
        searchFields: 'response,bogus,response,url',
      }) as never,
      createResponse() as never
    );

    expect(queryEntries).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'timeout', searchFields: ['response', 'url'] })
    );
  });

  it('omits search options when no search term is provided', async () => {
    const queryEntries = vi.fn(async () => ({ data: [], total: 0 }));
    setHandlerStorage({ queryEntries } as unknown as ITraceStorage);

    await listEntries(
      createQueryParamRequest({ searchFields: 'response' }) as never,
      createResponse() as never
    );

    const [options] = queryEntries.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(options.search).toBeUndefined();
  });
});

describe('trace search storage SQL', () => {
  it('searches only the selected JSON keys for sqlite', async () => {
    const { db, query } = createSearchDb('sqlite');
    const storage = TraceStorage.resolveStorage(db as never);

    await storage.queryEntries({
      page: 1,
      perPage: 10,
      search: 'timeout',
      searchFields: ['response'],
    });

    const [listSql, listParams] = findCall(query, 'json_extract(e.content');
    expect(listSql).toContain("json_extract(e.content, '$.responseBody') LIKE ? ESCAPE '!'");
    expect(listSql).toContain("json_extract(e.content, '$.responseStatus') LIKE ? ESCAPE '!'");
    expect(listParams).toContain('%timeout%');
  });

  it('escapes LIKE wildcards in the search term', async () => {
    const { db, query } = createSearchDb('sqlite');
    const storage = TraceStorage.resolveStorage(db as never);

    await storage.queryEntries({ page: 1, perPage: 10, search: '50%_off!' });

    const [, listParams] = findCall(query, 'LIKE ?');
    expect(listParams).toContain('%50!%!_off!!%');
  });

  it('uses ILIKE with jsonb extraction for postgresql', async () => {
    const { db, query } = createSearchDb('postgresql');
    const storage = TraceStorage.resolveStorage(db as never);

    await storage.queryEntries({
      page: 1,
      perPage: 10,
      search: 'Timeout',
      searchFields: ['url'],
    });

    const [listSql] = findCall(query, 'ILIKE');
    expect(listSql).toContain("(e.content::jsonb ->> 'url') ILIKE ? ESCAPE '!'");
  });

  it('uses JSON extraction for mysql and sqlserver', async () => {
    const mysql = createSearchDb('mysql');
    const mysqlStorage = TraceStorage.resolveStorage(mysql.db as never);
    await mysqlStorage.queryEntries({ page: 1, perPage: 10, search: 'api', searchFields: ['url'] });
    const [mysqlSql] = findCall(mysql.query, 'JSON_UNQUOTE');
    expect(mysqlSql).toContain("JSON_UNQUOTE(JSON_EXTRACT(e.content, '$.uri')) LIKE ? ESCAPE '!'");

    const sqlserver = createSearchDb('sqlserver');
    const sqlserverStorage = TraceStorage.resolveStorage(sqlserver.db as never);
    await sqlserverStorage.queryEntries({
      page: 1,
      perPage: 10,
      search: 'api',
      searchFields: ['url'],
    });
    const [sqlserverSql] = findCall(sqlserver.query, 'JSON_VALUE');
    expect(sqlserverSql).toContain(
      "COALESCE(JSON_VALUE(e.content, '$.uri'), JSON_QUERY(e.content, '$.uri')) LIKE ? ESCAPE '!'"
    );
  });

  it('applies the selected field group to batch entry searches', async () => {
    const { db, queryOne } = createSearchDb('sqlite');
    const storage = TraceStorage.resolveStorage(db as never);

    await storage.queryBatchEntries('batch-1', {
      page: 1,
      perPage: 10,
      search: 'needle',
      searchFields: ['request'],
    });

    const [countSql, countParams] = findCall(queryOne, '$.payload');
    expect(countSql).toContain("json_extract(content, '$.payload') LIKE ? ESCAPE '!'");
    expect(countParams).toContain('%needle%');
  });
});

describe('trace dashboard search markup', () => {
  it('renders a search form on the pages that support search', () => {
    const html = buildDashboardHtml('/trace');

    expect(html).toContain('data-search-form');
    expect(html).toContain("'entries'");
    expect(html).toContain("'overview'");
    expect(html).toContain("'monitoring'");
    expect(html).toContain("'request'");
    expect(html).toContain("'detail-global'");
    expect(html).toContain("search.set('batchSearch'");
  });

  it('wraps long unbroken values inside the summary and mono cells', () => {
    const html = buildDashboardHtml('/trace');

    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).toContain('min-width:0');
    expect(html).toContain('.activity-summary{overflow-wrap:anywhere;word-break:break-word}');
  });
});
