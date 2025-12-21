import { MicroserviceManager } from '@/microservices/MicroserviceManager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/config/env', () => ({
  Env: {
    get: vi.fn((key) => {
      if (key === 'SERVICES') return 'users,orders';
      if (key === 'MICROSERVICES') return 'true';
      return '';
    }),
    getBool: vi.fn(() => true),
  },
}));

vi.mock('@/config/logger');
vi.mock('@/http/Kernel');
vi.mock('@/runtime/RuntimeDetector');
vi.mock('@/security/UrlValidator');

describe('MicroserviceManager', () => {
  beforeEach(() => {
    MicroserviceManager.reset();
  });

  it('should initialize', () => {
    const manager = MicroserviceManager.initialize([], 3000);
    expect(manager).toBeDefined();
    expect(MicroserviceManager.getInstance()).toBe(manager);
  });

  it('should register service', async () => {
    const manager = MicroserviceManager.getInstance();
    await manager.registerService({
      name: 'users',
      domain: 'users',
      version: '1.0.0',
    });

    const service = manager.getService('users', 'users');
    expect(service).toBeDefined();
    expect(service?.name).toBe('users');
    expect(service?.status).toBe('starting');
  });

  it('should fail to get non-existent service', () => {
    const manager = MicroserviceManager.getInstance();
    expect(manager.getService('unknown', 'unknown')).toBeUndefined();
  });

  it('should list services', async () => {
    const manager = MicroserviceManager.getInstance();
    await manager.registerService({ name: 'users', domain: 'users' });
    await manager.registerService({ name: 'orders', domain: 'orders' });

    const list = manager.getAllServices();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name)).toContain('users');
    expect(list.map((s) => s.name)).toContain('orders');
  });

  it('should get status summary', async () => {
    const manager = MicroserviceManager.getInstance();
    await manager.registerService({ name: 'users', domain: 'users' });

    const summary = manager.getStatusSummary();
    expect(summary['totalServices']).toBe(1);
    expect(summary['runningServices']).toBe(0);
  });
});
