import { MicroserviceBootstrap, MicroservicesConfig } from '@/microservices/MicroserviceBootstrap';
import {
  getEnabledServices,
  isMicroservicesEnabled,
  MicroserviceManager,
} from '@/microservices/MicroserviceManager';
import { Logger } from '@config/logger';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  fsPromises: { readdir: vi.fn(), readFile: vi.fn() },
}));

const projectRuntimeMock = vi.hoisted(() => ({
  tryLoadNodeRuntime: vi.fn(async () => undefined),
  getServiceManifest: vi.fn(() => [] as unknown[]),
}));

const envMock = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
}));

vi.mock('@node-singletons/fs', () => ({
  default: fsMock,
  fsPromises: fsMock.fsPromises,
}));

vi.mock('@node-singletons/path');
vi.mock('@config/logger');
vi.mock('@/config/env', () => ({
  Env: {
    get DATABASE_ISOLATION() { return envMock.values['DATABASE_ISOLATION']; },
    get MICROSERVICES_TRACING() { return envMock.values['MICROSERVICES_TRACING']; },
    get MICROSERVICES_TRACING_RATE() { return envMock.values['MICROSERVICES_TRACING_RATE'] ?? 1; },
  },
}));
vi.mock('@config/env', () => ({
  Env: {
    get DATABASE_ISOLATION() { return envMock.values['DATABASE_ISOLATION']; },
    get MICROSERVICES_TRACING() { return envMock.values['MICROSERVICES_TRACING']; },
    get MICROSERVICES_TRACING_RATE() { return envMock.values['MICROSERVICES_TRACING_RATE'] ?? 1; },
  },
}));
vi.mock('@/microservices/MicroserviceManager', () => ({
  getEnabledServices: vi.fn(() => [] as string[]),
  isMicroservicesEnabled: vi.fn(() => true),
  MicroserviceManager: { getInstance: vi.fn(() => ({ register: vi.fn() })) },
}));
vi.mock('@runtime/ProjectRuntime', () => ({ ProjectRuntime: projectRuntimeMock }));

describe('MicroserviceBootstrap remaining branches', () => {
  const dir = '/mock/services';

  beforeEach(() => {
    vi.clearAllMocks();
    MicroserviceBootstrap.reset();
    vi.mocked(path.join).mockImplementation((...parts) => parts.join('/'));
    vi.mocked(path.resolve).mockImplementation((...parts) => parts.join('/'));
    vi.mocked(isMicroservicesEnabled).mockReturnValue(true);
    vi.mocked(getEnabledServices).mockReturnValue([]);
    projectRuntimeMock.getServiceManifest.mockReturnValue([]);
    fsMock.existsSync.mockReturnValue(false);
    fsMock.fsPromises.readdir.mockResolvedValue([]);
    envMock.values = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('discovers services from a static manifest and falls back to the filesystem', async () => {
    const bootstrap = MicroserviceBootstrap.create();
    bootstrap.setServicesDir(dir);

    projectRuntimeMock.getServiceManifest.mockReturnValueOnce([
      { id: 'shop/users', domain: 'shop', name: 'users' },
      { id: 'invalid', domain: '', name: '' },
    ]);
    const fromManifest = await bootstrap.discoverServices();
    expect(fromManifest).toHaveLength(2);
    expect(fromManifest[0]).toMatchObject({
      id: 'shop/users',
      port: 3001,
      version: '1.0.0',
      healthCheck: '/health',
    });
    expect(fromManifest[1]).toMatchObject({ id: 'invalid', port: 3002 });
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Discovered 2 microservices from static manifest')
    );

    projectRuntimeMock.getServiceManifest.mockReturnValueOnce([]);
    fsMock.existsSync.mockImplementation((target: unknown) => {
      const targetPath = String(target);
      return targetPath === dir || targetPath.endsWith('/users/service.config.json');
    });
    fsMock.fsPromises.readdir.mockImplementation(((target: string) => {
      if (target === dir) {
        return Promise.resolve([{ isDirectory: () => true, name: 'shop' }]);
      }
      if (target === `${dir}/shop`) {
        return Promise.resolve([
          { isDirectory: () => true, name: 'users' },
          { isDirectory: () => true, name: 'shared' },
          { isDirectory: () => false, name: 'file.txt' },
        ]);
      }
      return Promise.resolve([]);
    }) as never);
    fsMock.fsPromises.readFile.mockResolvedValue(JSON.stringify({ version: '2.0.0' }));
    const fromFs = await bootstrap.discoverServices();
    expect(fromFs).toHaveLength(1);
    expect(fromFs[0]).toMatchObject({ name: 'users', version: '2.0.0', port: 3001 });
  });

  it('returns no domains when the services directory is missing', async () => {
    const bootstrap = MicroserviceBootstrap.create();
    bootstrap.setServicesDir('/missing');
    fsMock.existsSync.mockReturnValue(false);
    await expect(bootstrap.discoverServices()).resolves.toEqual([]);
  });

  it('filters services by the SERVICES allow list', async () => {
    const bootstrap = MicroserviceBootstrap.create();
    bootstrap.setServicesDir(dir);
    vi.mocked(getEnabledServices).mockReturnValue(['users']);

    fsMock.existsSync.mockImplementation((target: unknown) => {
      const targetPath = String(target);
      return (
        targetPath === dir ||
        targetPath === `${dir}/shop/users/service.config.json` ||
        targetPath === `${dir}/shop/orders/service.config.json`
      );
    });
    fsMock.fsPromises.readdir.mockImplementation(((target: string) => {
      if (target === dir) return Promise.resolve([{ isDirectory: () => true, name: 'shop' }]);
      if (target === `${dir}/shop`) {
        return Promise.resolve([
          { isDirectory: () => true, name: 'users' },
          { isDirectory: () => true, name: 'orders' },
        ]);
      }
      return Promise.resolve([]);
    }) as never);
    fsMock.fsPromises.readFile.mockResolvedValue(JSON.stringify({ version: '1.0.0' }));

    const services = await bootstrap.discoverServices();
    expect(services.map((service) => service.name)).toEqual(['users']);
  });

  it('loads configuration defaults and explicit overrides from service.config.json', async () => {
    const bootstrap = MicroserviceBootstrap.create();
    bootstrap.setServicesDir(dir);

    fsMock.existsSync.mockImplementation(
      (target: unknown) =>
        String(target) === dir || String(target).includes('service.config.json')
    );
    fsMock.fsPromises.readdir.mockImplementation(((target: string) => {
      if (target === dir) return Promise.resolve([{ isDirectory: () => true, name: 'shop' }]);
      if (target === `${dir}/shop`) {
        return Promise.resolve([
          { isDirectory: () => true, name: 'minimal' },
          { isDirectory: () => true, name: 'configured' },
        ]);
      }
      return Promise.resolve([]);
    }) as never);
    fsMock.fsPromises.readFile.mockImplementation((async (target: string) => {
      if (String(target).includes('minimal')) return JSON.stringify({});
      return JSON.stringify({
        version: '3.0.0',
        port: 8080,
        description: 'configured service',
        dependencies: ['db'],
        healthCheck: '/ready',
        database: { isolation: 'isolated', migrations: false },
        auth: { strategy: 'jwt', secretKey: 's', publicKey: 'p' },
        tracing: { enabled: true, samplingRate: 0.25 },
      });
    }) as never);

    const services = await bootstrap.discoverServices();
    expect(services[0]).toMatchObject({
      port: 3001,
      version: undefined,
      dependencies: [],
      healthCheck: '/health',
      database: { isolation: 'shared', migrations: true },
      auth: { strategy: 'none' },
      tracing: { enabled: false, samplingRate: 1 },
    });
    expect(services[1]).toMatchObject({
      port: 8080,
      version: '3.0.0',
      dependencies: ['db'],
      healthCheck: '/ready',
      database: { isolation: 'isolated', migrations: false },
      auth: { strategy: 'jwt', secretKey: 's', publicKey: 'p' },
      tracing: { enabled: true, samplingRate: 0.25 },
    });
    expect(bootstrap.isServiceIsolated('shop', 'configured')).toBe(true);
    expect(bootstrap.getServiceAuthStrategy('shop', 'configured')).toBe('jwt');
    expect(bootstrap.isTracingEnabled('shop', 'configured')).toBe(true);
    expect(bootstrap.getTracingSamplingRate('shop', 'configured')).toBe(0.25);
  });

  it('handles discovery errors based on their error code', async () => {
    const bootstrap = MicroserviceBootstrap.create();
    bootstrap.setServicesDir(dir);

    fsMock.existsSync.mockReturnValue(true);
    fsMock.fsPromises.readdir.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    await expect(bootstrap.discoverServices()).resolves.toEqual([]);
    expect(Logger.error).toHaveBeenCalledWith('Failed to discover microservices', expect.any(Error));

    vi.mocked(Logger.error).mockClear();
    fsMock.fsPromises.readdir.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(bootstrap.discoverServices()).resolves.toEqual([]);
    expect(Logger.error).toHaveBeenCalledWith('Error discovering services:', expect.any(Error));
  });

  it('initializes only when microservices are enabled and registers services', async () => {
    vi.mocked(isMicroservicesEnabled).mockReturnValue(false);
    const disabled = MicroserviceBootstrap.create();
    await disabled.initialize();
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Microservices disabled'));

    vi.mocked(isMicroservicesEnabled).mockReturnValue(true);
    projectRuntimeMock.getServiceManifest.mockReturnValue([
      {
        id: 'shop/users',
        domain: 'shop',
        name: 'users',
        port: 4000,
        version: '9.0.0',
        healthCheck: '/ready',
        description: 'explicit',
      },
    ]);
    const register = vi.fn();
    vi.mocked(MicroserviceManager.getInstance).mockReturnValue({ register } as never);

    const bootstrap = MicroserviceBootstrap.create();
    await bootstrap.initialize();
    expect(register).toHaveBeenCalledTimes(1);
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('migrations enabled'));
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Microservices initialized'));
  });

  it('reads per-service isolation, auth and tracing settings with defaults', () => {
    const bootstrap = MicroserviceBootstrap.create();
    expect(bootstrap.isServiceIsolated('shop', 'users')).toBe(false);
    expect(bootstrap.getServiceAuthStrategy('shop', 'users')).toBe('none');
    expect(bootstrap.isTracingEnabled('shop', 'users')).toBe(false);
    expect(bootstrap.getTracingSamplingRate('shop', 'users')).toBe(1);

    projectRuntimeMock.getServiceManifest.mockReturnValue([
      {
        id: 'shop/users',
        domain: 'shop',
        name: 'users',
        monolithEnabled: false,
      },
    ]);

    const stateBootstrap = MicroserviceBootstrap.create();
    expect(stateBootstrap.getAllServiceConfigs()).toEqual([]);
    expect(stateBootstrap.getServicesDir()).toContain('services');
  });

  it('exposes global configuration helpers with env variants and clamping', () => {
    envMock.values['DATABASE_ISOLATION'] = 'isolated';
    expect(MicroservicesConfig.isDatabaseShared()).toBe(false);
    envMock.values['DATABASE_ISOLATION'] = 'shared';
    expect(MicroservicesConfig.isDatabaseShared()).toBe(true);

    expect(MicroservicesConfig.getAuthStrategies()).toEqual(['api-key', 'jwt', 'none', 'custom']);
    expect(MicroservicesConfig.getDatabaseIsolations()).toEqual(['shared', 'isolated']);

    envMock.values['MICROSERVICES_TRACING'] = true;
    expect(MicroservicesConfig.isTracingGloballyEnabled()).toBe(true);
    envMock.values['MICROSERVICES_TRACING'] = false;
    expect(MicroservicesConfig.isTracingGloballyEnabled()).toBe(false);

    envMock.values['MICROSERVICES_TRACING_RATE'] = 2;
    expect(MicroservicesConfig.getGlobalTracingSamplingRate()).toBe(1);
    envMock.values['MICROSERVICES_TRACING_RATE'] = -2;
    expect(MicroservicesConfig.getGlobalTracingSamplingRate()).toBe(0);
    envMock.values['MICROSERVICES_TRACING_RATE'] = 0.4;
    expect(MicroservicesConfig.getGlobalTracingSamplingRate()).toBe(0.4);
  });
});
