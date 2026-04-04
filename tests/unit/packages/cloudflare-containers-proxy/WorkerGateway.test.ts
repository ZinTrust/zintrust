import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class MockDurableObject {},
    WorkerEntrypoint: class MockWorkerEntrypoint {},
  }),
  { virtual: true }
);

vi.mock('@cloudflare/containers', () => ({
  Container: class MockContainer {
    public async startAndWaitForPorts(): Promise<void> {
      return undefined;
    }

    public async fetch(request: Request): Promise<Response> {
      return new Response(JSON.stringify({ path: new URL(request.url).pathname }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
  },
}));

vi.mock('@zintrust/core', () => ({
  Logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  ErrorFactory: {
    createValidationError: (message: string) => new Error(message),
  },
}));

type NamespaceStub = {
  getByName: ReturnType<typeof vi.fn>;
};

type GatewayEnv = Record<string, NamespaceStub>;

const createEnv = (fetchImpl: ReturnType<typeof vi.fn>): GatewayEnv => ({
  ZT_PROXY_MYSQL: { getByName: vi.fn(() => ({ fetch: fetchImpl })) },
  ZT_PROXY_POSTGRES: { getByName: vi.fn(() => ({ fetch: fetchImpl })) },
  ZT_PROXY_REDIS: { getByName: vi.fn(() => ({ fetch: fetchImpl })) },
  ZT_PROXY_MONGODB: { getByName: vi.fn(() => ({ fetch: fetchImpl })) },
  ZT_PROXY_SQLSERVER: { getByName: vi.fn(() => ({ fetch: fetchImpl })) },
  ZT_PROXY_SMTP: { getByName: vi.fn(() => ({ fetch: fetchImpl })) },
});

describe('cloudflare containers proxy worker gateway', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('routes public redis gateway paths into the redis container', async () => {
    const fetchImpl = vi.fn(async (request: Request) => {
      return new Response(JSON.stringify({ path: new URL(request.url).pathname }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const env = createEnv(fetchImpl);

    const worker = (await import('../../../../packages/cloudflare-containers-proxy/src/index'))
      .default;
    const response = await worker.fetch(
      new Request('https://proxy.test/redis/zin/redis/command'),
      env as never
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(new URL(fetchImpl.mock.calls[0]?.[0].url).pathname).toBe('/zin/redis/command');
  });

  it('routes internal zin redis proxy paths without requiring the public redis prefix', async () => {
    const fetchImpl = vi.fn(async (request: Request) => {
      return new Response(JSON.stringify({ path: new URL(request.url).pathname }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const env = createEnv(fetchImpl);

    const worker = (await import('../../../../packages/cloudflare-containers-proxy/src/index'))
      .default;
    const response = await worker.fetch(
      new Request('https://proxy.test/zin/redis/command'),
      env as never
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(new URL(fetchImpl.mock.calls[0]?.[0].url).pathname).toBe('/zin/redis/command');
  });
});
