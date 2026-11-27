import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  validateUrl: vi.fn(),
  fetch: vi.fn(),
  setTimeout: vi.fn(() => 123 as unknown as ReturnType<typeof setTimeout>),
  clearTimeout: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  Env: {
    get: (key: string, fallback = '') => m.env[key] ?? fallback,
    getBool: (key: string, fallback = false) => {
      const value = m.env[key];
      if (value === undefined) return fallback;
      return value === true || String(value).toLowerCase() === 'true';
    },
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (key: string, fallback = '') => m.env[key] ?? fallback,
    getBool: (key: string, fallback = false) => {
      const value = m.env[key];
      if (value === undefined) return fallback;
      return value === true || String(value).toLowerCase() === 'true';
    },
  },
}));

vi.mock('@/config/logger', () => ({
  Logger: {
    info: (...args: unknown[]) => m.loggerInfo(...args),
    error: (...args: unknown[]) => m.loggerError(...args),
  },
}));

vi.mock('@/security/UrlValidator', () => ({
  validateUrl: (...args: unknown[]) => m.validateUrl(...args),
}));

import {
  getEnabledServices,
  isMicroservicesEnabled,
  MicroserviceManager,
} from '@/microservices/MicroserviceManager';

const resetEnv = (values: Record<string, unknown> = {}) => {
  for (const key of Object.keys(m.env)) Reflect.deleteProperty(m.env, key);
  Object.assign(m.env, values);
};

describe('MicroserviceManager remaining branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnv();
    MicroserviceManager.reset();
    m.fetch.mockReset();
    m.setTimeout.mockClear();
    m.clearTimeout.mockClear();
    vi.stubGlobal('fetch', m.fetch);
    vi.stubGlobal('setTimeout', m.setTimeout);
    vi.stubGlobal('clearTimeout', m.clearTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnv();
  });

  it('resolves services by id, by unique name, and rejects ambiguous names', async () => {
    MicroserviceManager.initialize(
      [
        { name: 'users', domain: 'shop', port: 4100, status: 'running' },
        { name: 'users', domain: 'admin', port: 4101, status: 'running' },
      ],
      5000
    );

    await expect(MicroserviceManager.callService('users', '/x')).rejects.toThrow(/Ambiguous/);
    await expect(MicroserviceManager.startService('shop/users')).resolves.toBe(true);
    await expect(MicroserviceManager.stopService('admin/users')).resolves.toBe(true);
    expect(MicroserviceManager.getService('shop', 'users')?.port).toBe(4100);
    expect(MicroserviceManager.getAllServices()).toHaveLength(2);
    expect(MicroserviceManager.getServicesByDomain('admin')).toHaveLength(1);
    await expect(MicroserviceManager.startService('missing')).rejects.toThrow(/not found/i);
    await expect(MicroserviceManager.stopService('missing')).resolves.toBe(false);
  });

  it('honors explicit ports, urls, health checks and status defaults', () => {
    const registered = MicroserviceManager.registerService({
      name: 'users',
      domain: 'shop',
      healthCheck: '/ready',
      baseUrl: 'https://users.example',
    });
    expect(registered).toMatchObject({
      id: 'shop/users',
      port: 3000,
      baseUrl: 'https://users.example',
      healthCheckUrl: '/ready',
      status: 'starting',
    });

    const second = MicroserviceManager.register({
      name: 'orders',
      domain: 'shop',
      port: 5001,
      status: 'running',
      healthCheckUrl: '/healthz',
    });
    expect(second).toMatchObject({ port: 5001, healthCheckUrl: '/healthz', status: 'running' });

    const third = MicroserviceManager.registerService({
      name: 'billing',
      domain: 'shop',
      healthCheck: true,
    });
    expect(third.healthCheckUrl).toBe('/health');
    expect(third.baseUrl).toBe('http://localhost:3002');
  });

  it('skips registration for services excluded by the SERVICES allow list', () => {
    resetEnv({ SERVICES: 'other/service' });
    expect(MicroserviceManager.registerService({ name: 'users', domain: 'shop' })).toBeNull();
    expect(MicroserviceManager.getAllServices()).toHaveLength(0);

    const registered = MicroserviceManager.registerService({ name: 'orders', domain: 'shop' });
    expect(registered).toBeNull();
    expect(m.loggerInfo).toHaveBeenCalledWith(expect.stringContaining('not in SERVICES'));
  });

  it('calls services with string and object options and normalizes responses', async () => {
    MicroserviceManager.registerService({
      name: 'users',
      domain: 'shop',
      port: 4200,
      status: 'running',
    });
    m.fetch.mockResolvedValue({ status: 201, json: async () => ({ ok: true }) });

    await expect(
      MicroserviceManager.callService('users', {
        method: 'POST',
        path: '/create',
        headers: { 'x-test': '1' },
        body: { a: 1 },
        timeout: 50,
      })
    ).resolves.toEqual({ statusCode: 201, data: { ok: true } });

    expect(m.setTimeout).toHaveBeenCalledWith(expect.any(Function), 50);
    expect(m.clearTimeout).toHaveBeenCalledWith(123);
    expect(m.validateUrl).toHaveBeenCalledWith('http://localhost:4200/create');
    expect(m.fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'x-test': '1' },
    });

    m.fetch.mockResolvedValueOnce({ status: 200, json: async () => { throw new Error('bad json'); } });
    await expect(MicroserviceManager.callService('users', {})).resolves.toEqual({
      statusCode: 200,
      data: {},
    });
    expect(m.fetch.mock.calls.at(-1)?.[0]).toBe('http://localhost:4200/');

    m.fetch.mockResolvedValueOnce({ status: 200, json: async () => null });
    await expect(
      MicroserviceManager.callService('users', { method: undefined, path: '/list' })
    ).resolves.toEqual({ statusCode: 200, data: null });
    expect(m.fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'GET' });
    expect(m.setTimeout).toHaveBeenCalledTimes(1);
  });

  it('wraps fetch failures and drops the body for GET requests', async () => {
    MicroserviceManager.registerService({
      name: 'users',
      domain: 'shop',
      status: 'running',
      baseUrl: 'http://users.local',
    });
    m.fetch.mockRejectedValueOnce(new Error('network down'));
    await expect(MicroserviceManager.callService('users', '/x')).rejects.toThrow(
      /Failed to call service/
    );
    expect(m.loggerError).toHaveBeenCalled();

    m.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({}) });
    await MicroserviceManager.callService('users', '/get', { body: { ignored: true } });
    expect(m.fetch.mock.calls.at(-1)?.[1]?.body).toBeUndefined();
  });

  it('checks health for missing, healthy, unhealthy and failing services', async () => {
    await expect(MicroserviceManager.checkServiceHealth('missing')).resolves.toBe(false);

    MicroserviceManager.registerService({
      name: 'users',
      domain: 'shop',
      port: 4300,
      healthCheckUrl: '/ready',
    });
    m.fetch.mockResolvedValueOnce({ ok: true });
    await expect(MicroserviceManager.checkServiceHealth('users')).resolves.toBe(true);
    expect(m.fetch.mock.calls[0]?.[0]).toBe('http://localhost:4300/ready');

    m.fetch.mockResolvedValueOnce({ ok: false });
    await expect(MicroserviceManager.checkServiceHealth('users')).resolves.toBe(false);

    m.fetch.mockRejectedValueOnce('offline');
    await expect(MicroserviceManager.checkServiceHealth('users')).resolves.toBe(false);
    expect(m.loggerError).toHaveBeenCalledWith('Health check failed', 'offline');

    await expect(MicroserviceManager.healthCheckAll()).resolves.toEqual({ 'shop/users': false });
    expect(MicroserviceManager.getStatusSummary()).toMatchObject({
      totalServices: 1,
      runningServices: 0,
    });
    await expect(MicroserviceManager.discoverServices()).resolves.toHaveLength(1);

    await MicroserviceManager.stopAllServices();
    expect(MicroserviceManager.getAllServices()[0]?.status).toBe('stopped');
  });

  it('uses basePort and default health path when the service omits them', async () => {
    MicroserviceManager.initialize([{ name: 'users', domain: 'shop' }], 6000);
    m.fetch.mockResolvedValueOnce({ ok: true });
    await expect(MicroserviceManager.checkServiceHealth('users')).resolves.toBe(true);
    expect(m.fetch.mock.calls[0]?.[0]).toBe('http://localhost:6000/health');
    expect(MicroserviceManager.getAllServices()[0]?.port).toBe(6000);

    MicroserviceManager.reset();
    MicroserviceManager.registerService({ name: 'users', domain: 'shop', status: 'running' });
    m.fetch.mockResolvedValueOnce({ ok: true });
    await expect(MicroserviceManager.checkServiceHealth('users')).resolves.toBe(true);
    expect(m.fetch.mock.calls.at(-1)?.[0]).toBe('http://localhost:3000/health');
  });

  it('reads microservices enablement and SERVICES allow lists from env', () => {
    expect(isMicroservicesEnabled()).toBe(false);
    resetEnv({ MICROSERVICES: 'TRUE' });
    expect(isMicroservicesEnabled()).toBe(true);
    resetEnv({ MICROSERVICES: 'false', ENABLE_MICROSERVICES: 'true' });
    expect(isMicroservicesEnabled()).toBe(true);
    resetEnv({ MICROSERVICES: 'false', ENABLE_MICROSERVICES: 'false' });
    expect(isMicroservicesEnabled()).toBe(false);

    resetEnv({ SERVICES: ' users , , orders ' });
    expect(getEnabledServices()).toEqual(['users', 'orders']);
    resetEnv({ SERVICES: '  ' });
    expect(getEnabledServices()).toEqual([]);
  });
});
