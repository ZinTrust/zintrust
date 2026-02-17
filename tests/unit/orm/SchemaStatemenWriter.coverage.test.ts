import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  fsPromises: {
    appendFile: vi.fn(async () => undefined),
  },
}));

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    sha256Hex: vi.fn(async (input: string) => `id:${input}`),
  },
}));

vi.mock('@/config', () => ({
  appConfig: {
    isDevelopment: () => true,
  },
}));

const importWriter = async () => {
  // MAX_SEEN_STATEMENT_IDS is computed at module load time.
  vi.resetModules();
  return await import('../../../src/orm/SchemaStatemenWriter');
};

const { fsPromises } = await import('@node-singletons/fs');

describe('SchemaStatemenWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env['ZT_D1_LEARN_FILE'];
    delete process.env['SQL_WRITER'];
    delete process.env['SQL_WRITER_MAX_SEEN_STATEMENT_IDS'];
  });

  it('fromJsonl ignores malformed lines and parses valid entries', async () => {
    const { StatementRegistryBuild } = await importWriter();
    const out = StatementRegistryBuild.fromJsonl(
      [
        '',
        '   ',
        '{"statementId":"","sql":"select 1"}',
        '{"statementId":"a","sql":""}',
        '{not json',
        '{"statementId":"ok","sql":"select 1"}',
      ].join('\n')
    );

    expect(out).toEqual({ ok: 'select 1' });
  });

  it('merge and toStatementsJson behave deterministically', async () => {
    const { StatementRegistryBuild } = await importWriter();

    expect(StatementRegistryBuild.merge(undefined, undefined)).toEqual({});
    expect(StatementRegistryBuild.merge(undefined, { a: '1' })).toEqual({ a: '1' });
    expect(StatementRegistryBuild.merge({ a: '1' }, undefined)).toEqual({ a: '1' });
    expect(StatementRegistryBuild.merge({ a: '1' }, { a: '2', b: '3' })).toEqual({
      a: '2',
      b: '3',
    });

    const json = StatementRegistryBuild.toStatementsJson({ a: 'select 1' });
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toEqual({ a: 'select 1' });
  });

  it('SchemaWriter appends JSONL when learning mode enabled and dedupes by statementId', async () => {
    vi.stubEnv('ZT_D1_LEARN_FILE', '/tmp/learn.jsonl');

    const { SchemaWriter } = await importWriter();

    await SchemaWriter('select 1');
    await SchemaWriter('select 1');

    expect(vi.mocked(fsPromises.appendFile)).toHaveBeenCalledTimes(1);
  });

  it('SchemaWriter clears seen ids when cap exceeded (bounded memory)', async () => {
    vi.stubEnv('ZT_D1_LEARN_FILE', '/tmp/learn.jsonl');
    vi.stubEnv('SQL_WRITER_MAX_SEEN_STATEMENT_IDS', '1');

    const { SchemaWriter } = await importWriter();

    // 1st call: add id:select 1
    await SchemaWriter('select 1');
    // 2nd call: add id:select 2, cap exceeded -> clear + add
    await SchemaWriter('select 2');
    // 3rd call: select 1 should no longer be considered seen
    await SchemaWriter('select 1');

    expect(vi.mocked(fsPromises.appendFile)).toHaveBeenCalledTimes(3);
  });
});
