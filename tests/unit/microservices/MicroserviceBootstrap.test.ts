import { MicroserviceBootstrap } from '@/microservices/MicroserviceBootstrap';
import { getEnabledServices, isMicroservicesEnabled } from '@/microservices/MicroserviceManager';
import { Logger } from '@config/logger';
import fs, { fsPromises } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  fsPromises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

const projectRuntimeMock = vi.hoisted(() => ({
  tryLoadNodeRuntime: vi.fn().mockResolvedValue(undefined),
  getServiceManifest: vi.fn().mockReturnValue([]),
}));

vi.mock('@node-singletons/fs', () => ({
  default: fsMock,
  fsPromises: fsMock.fsPromises,
}));
vi.mock('@node-singletons/path');
vi.mock('@config/logger');
vi.mock('@/config/env');
vi.mock('@/microservices/MicroserviceManager');
vi.mock('@runtime/ProjectRuntime', () => ({ ProjectRuntime: projectRuntimeMock }));

describe('MicroserviceBootstrap', () => {
  const mockServicesDir = '/mock/services';

  beforeEach(() => {
    MicroserviceBootstrap.reset();
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    vi.mocked(path.resolve).mockImplementation((...args) => args.join('/'));
    vi.mocked(isMicroservicesEnabled).mockReturnValue(true);
    vi.mocked(getEnabledServices).mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be a singleton', () => {
    const instance1 = MicroserviceBootstrap.getInstance();
    const instance2 = MicroserviceBootstrap.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should discover services', async () => {
    const bootstrap = MicroserviceBootstrap.getInstance();
    bootstrap.setServicesDir(mockServicesDir);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.readdir).mockImplementation(((dir: any) => {
      if (dir === mockServicesDir) {
        return Promise.resolve([{ isDirectory: () => true, name: 'domain1' }]);
      }
      if (dir === path.join(mockServicesDir, 'domain1')) {
        return Promise.resolve([{ isDirectory: () => true, name: 'service1' }]);
      }
      return Promise.resolve([]);
    }) as any);

    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({
        name: 'service1',
        domain: 'domain1',
        version: '1.0.0',
      })
    );

    const services = await bootstrap.discoverServices();

    expect(services).toHaveLength(1);
    expect(services[0].name).toBe('service1');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Discovered 1 microservices'));
  });

  it('should return empty array if microservices disabled', async () => {
    vi.mocked(isMicroservicesEnabled).mockReturnValue(false);
    const bootstrap = MicroserviceBootstrap.getInstance();
    const services = await bootstrap.discoverServices();
    expect(services).toEqual([]);
  });

  it('should keep default ports contiguous when some enabled services lack configs', async () => {
    const bootstrap = MicroserviceBootstrap.getInstance();
    bootstrap.setServicesDir(mockServicesDir);

    vi.mocked(fs.existsSync).mockImplementation((targetPath: any) => {
      if (targetPath === mockServicesDir) return true;

      return [
        path.join(mockServicesDir, 'domain1', 'service1', 'service.config.json'),
        path.join(mockServicesDir, 'domain1', 'service3', 'service.config.json'),
      ].includes(targetPath);
    });

    vi.mocked(fsPromises.readdir).mockImplementation(((dir: any) => {
      if (dir === mockServicesDir) {
        return Promise.resolve([{ isDirectory: () => true, name: 'domain1' }]);
      }

      if (dir === path.join(mockServicesDir, 'domain1')) {
        return Promise.resolve([
          { isDirectory: () => true, name: 'service1' },
          { isDirectory: () => true, name: 'service2' },
          { isDirectory: () => true, name: 'service3' },
        ]);
      }

      return Promise.resolve([]);
    }) as any);

    vi.mocked(fsPromises.readFile).mockImplementation(async (filePath: any) => {
      if (filePath === path.join(mockServicesDir, 'domain1', 'service1', 'service.config.json')) {
        return JSON.stringify({ version: '1.0.0' });
      }

      if (filePath === path.join(mockServicesDir, 'domain1', 'service3', 'service.config.json')) {
        return JSON.stringify({ version: '1.0.0' });
      }

      throw new Error(`Unexpected read: ${String(filePath)}`);
    });

    const services = await bootstrap.discoverServices();

    expect(services).toHaveLength(2);
    expect(services.map((service) => service.name)).toEqual(['service1', 'service3']);
    expect(services.map((service) => service.port)).toEqual([3001, 3002]);
    expect(fsPromises.readFile).not.toHaveBeenCalledWith(
      path.join(mockServicesDir, 'domain1', 'service2', 'service.config.json'),
      'utf-8'
    );
  });
});
