import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectRuntime, getRuntimeMode, isNodeRuntime } from '@/runtime/detectRuntime';

describe('detectRuntime extra branches', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env['RUNTIME_MODE'];
    delete process.env['DOCKER'];
    delete process.env['KUBERNETES_SERVICE_HOST'];
    vi.stubGlobal('navigator', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.keys(process.env).forEach((key) => {
      Reflect.deleteProperty(process.env, key);
    });
    Object.assign(process.env, originalEnv);

    delete (globalThis as { CF?: unknown }).CF;
    delete (globalThis as { WebSocketPair?: unknown }).WebSocketPair;
    delete (globalThis as { Deno?: unknown }).Deno;
    delete (globalThis as { Bun?: unknown }).Bun;
  });

  it('uses explicit RUNTIME_MODE env override first', () => {
    process.env['RUNTIME_MODE'] = 'containers';
    expect(getRuntimeMode()).toBe('containers');
  });

  it('detects cloudflare-workers via navigator userAgent', () => {
    delete process.env['RUNTIME_MODE'];
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
    expect(getRuntimeMode()).toBe('cloudflare-workers');
  });

  it('detects containers when docker/kubernetes env vars are present', () => {
    delete process.env['RUNTIME_MODE'];
    process.env['DOCKER'] = '1';
    expect(getRuntimeMode()).toBe('containers');

    delete process.env['DOCKER'];
    process.env['KUBERNETES_SERVICE_HOST'] = 'kube.local';
    expect(getRuntimeMode()).toBe('containers');
  });

  it('defaults to node-server in node runtime when no container flags are set', () => {
    delete process.env['RUNTIME_MODE'];
    delete process.env['DOCKER'];
    delete process.env['KUBERNETES_SERVICE_HOST'];
    expect(getRuntimeMode()).toBe('node-server');
  });

  it('returns node runtime false when process is unavailable', () => {
    vi.stubGlobal('process', { env: {} });
    expect(isNodeRuntime()).toBe(false);
    expect(getRuntimeMode()).toBe('node-server');
  });

  it('detectRuntime flags cloudflare by WebSocketPair and CF, plus Deno and Bun', () => {
    (globalThis as { WebSocketPair?: unknown }).WebSocketPair = function MockPair() {
      return undefined;
    };
    (globalThis as { CF?: unknown }).CF = {};
    (globalThis as { Deno?: unknown }).Deno = {};
    (globalThis as { Bun?: unknown }).Bun = {};

    const result = detectRuntime();
    expect(result.isCloudflare).toBe(true);
    expect(result.isDeno).toBe(true);
    expect(result.isBun).toBe(true);
    expect(result.isNode).toBe(true);
  });
});
