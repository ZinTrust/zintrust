import { MicroserviceBootstrap } from '@/microservices/MicroserviceBootstrap';
import { getEnabledServices, isMicroservicesEnabled } from '@/microservices/MicroserviceManager';
import { Logger } from '@config/logger';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs');
vi.mock('node:path');
vi.mock('@config/logger');
vi.mock('@/config/env');
vi.mock('@/microservices/MicroserviceManager');

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
    vi.mocked(fs.readdirSync).mockImplementation(((dir: any) => {
      if (dir === mockServicesDir) {
        return ['domain1'] as unknown as fs.Dirent[];
      }
      if (dir === path.join(mockServicesDir, 'domain1')) {
        return ['service1'] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as any);

    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as any);

    vi.mocked(fs.readFileSync).mockReturnValue(
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
});
