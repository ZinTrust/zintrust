import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => {
  const fn = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };

  return {
    default: fn,
    ...fn,
  };
});

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Logger } from '@/config/logger';
import { fs } from '@node-singletons';

import { ServiceBundler, bundleServices, createServiceImage } from '@/microservices/ServiceBundler';

describe('ServiceBundler (coverage)', () => {
  const existing = new Set<string>();

  const sizes: Record<string, number> = {
    'main.js': 1024 * 1024,
    'child.js': 1024 * 1024,
    'package.json': 256,
    'service.config.json': 128,
    '.env.example': 64,
  };

  const isDistPath = (p: string) => p.includes('/dist');

  const readdirFor = (p: string): string[] => {
    if (p.endsWith('/dist')) return ['nested', 'main.js'];
    if (p.endsWith('/dist/nested')) return ['child.js'];
    return [];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    existing.clear();

    existing.add('services/default/billing/dist');
    existing.add('services/default/billing/dist/nested');
    existing.add('services/default/billing/package.json');
    existing.add('services/default/billing/service.config.json');
    existing.add('services/default/billing/.env.example');

    vi.mocked(fs.existsSync).mockImplementation(
      (p: any) => existing.has(String(p)) || isDistPath(String(p))
    );
    vi.mocked(fs.mkdirSync).mockImplementation((p: any) => {
      existing.add(String(p));
      return undefined as any;
    });
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readdirSync).mockImplementation((p: any) => readdirFor(String(p)) as any);
    vi.mocked(fs.statSync).mockImplementation((p: any) => {
      const pathStr = String(p);
      const base = pathStr.split('/').pop() ?? '';
      return {
        isDirectory: () => pathStr.endsWith('/dist') || pathStr.endsWith('/dist/nested'),
        size: sizes[base] ?? 0,
      } as any;
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('bundles services with nested directories and logs warnings for large bundles', async () => {
    const bundler = ServiceBundler.create();

    const result = await bundler.bundleService({
      serviceName: 'billing',
      domain: 'default',
      outputDir: 'dist/bundles',
      targetSize: 1,
    });

    expect(result.files).toBeGreaterThan(0);
    expect(Logger.warn).toHaveBeenCalled();
  });

  it('logs summary and continues when a service fails to bundle', async () => {
    const bundler = ServiceBundler.create();

    const original = bundler.bundleService;
    bundler.bundleService = vi.fn(async (config) => {
      if (config.serviceName === 'bad') {
        throw new Error('boom');
      }
      return original(config);
    });

    const results = await bundler.bundleAll('default', ['billing', 'bad'], 'dist/bundles');

    expect(results.length).toBe(1);
    expect(Logger.error).toHaveBeenCalled();
  });

  it('creates a docker image and writes Dockerfile', async () => {
    const tag = await createServiceImage('billing', 'default', 'registry.example');

    expect(tag).toBe('registry.example/default-billing:latest');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('logs when not all services are optimized in bundleServices', async () => {
    await bundleServices('default', 'billing');

    expect(Logger.info).toHaveBeenCalledWith(
      '⚠️  Some services exceed 1MB target - consider further optimization'
    );
  });
});
