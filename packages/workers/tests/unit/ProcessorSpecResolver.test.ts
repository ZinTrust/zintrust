import { afterEach, describe, expect, it, vi } from 'vitest';

import { workersConfig } from '@zintrust/core';

const fixtureUrl = 'https://wk.zintrust.com/fixtures/processor.js';

vi.unmock('@zintrust/workers');
const workersModule = await import('@zintrust/workers');
const WorkerFactory = workersModule.WorkerFactory as unknown as {
  resolveProcessorSpec: (spec: string) => Promise<unknown>;
};

describe('ProcessorSpecResolver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves processor from file url', async () => {
    const spec = `file://${process.cwd()}/packages/workers/tests/fixtures/processor.js`;
    const resolved = await WorkerFactory.resolveProcessorSpec(spec);
    expect(typeof resolved).toBe('function');
  });

  it('rejects url specs from disallowed hosts', async () => {
    const spec = 'https://example.com/processor.js';
    const resolved = await WorkerFactory.resolveProcessorSpec(spec);
    expect(resolved).toBeUndefined();
  });

  it('resolves remote processor via allowlisted url', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('export const ZinTrustProcessor = async () => undefined;', {
          status: 200,
          headers: { 'content-type': 'text/javascript' },
        })
    );

    vi.stubGlobal('fetch', fetchMock);

    const resolved = await WorkerFactory.resolveProcessorSpec(fixtureUrl);
    expect(typeof resolved).toBe('function');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rewrites quoted package imports in remote processor code without regex backtracking', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          [
            'import { generateUuid } from "@zintrust/core";',
            "import { isNonEmptyString } from '@zintrust/core';",
            'export const ZinTrustProcessor = async () => ({',
            '  hasUuid: typeof generateUuid === "function",',
            '  hasValidator: typeof isNonEmptyString === "function",',
            '});',
          ].join('\n'),
          {
            status: 200,
            headers: { 'content-type': 'text/javascript' },
          }
        )
    );

    vi.stubGlobal('fetch', fetchMock);

    const resolved = (await WorkerFactory.resolveProcessorSpec(`${fixtureUrl}?rewrite=1`)) as
      | (() => Promise<{ hasUuid: boolean; hasValidator: boolean }>)
      | undefined;

    expect(typeof resolved).toBe('function');
    await expect(resolved?.()).resolves.toEqual({ hasUuid: true, hasValidator: true });
  });

  it('honors cache for subsequent fetches', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('export const ZinTrustProcessor = async () => undefined;', {
          status: 200,
          headers: { 'content-type': 'text/javascript', 'cache-control': 'max-age=3600' },
        })
    );

    vi.stubGlobal('fetch', fetchMock);

    const cacheTestUrl = `${fixtureUrl}?cache-test=1`;
    const first = await WorkerFactory.resolveProcessorSpec(cacheTestUrl);
    const second = await WorkerFactory.resolveProcessorSpec(cacheTestUrl);

    expect(typeof first).toBe('function');
    expect(typeof second).toBe('function');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses default allowlist', () => {
    expect(workersConfig.processorSpec.remoteAllowlist).toContain('wk.zintrust.com');
  });
});
