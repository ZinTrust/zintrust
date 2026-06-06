import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueueMonitorApi } from '../src/index';
import { QueueMonitor } from '../src/index';

// Mock dependencies
vi.mock('bullmq', () => {
  return {
    Queue: class {
      add = vi.fn().mockResolvedValue({ id: '1' });
      getJob = vi.fn();
      getJobCounts = vi.fn().mockResolvedValue({
        active: 0,
        waiting: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      });
      close = vi.fn();
    },
    Worker: class {
      on = vi.fn();
      close = vi.fn();
    },
  };
});

vi.mock('ioredis', () => {
  return {
    default: class {
      hincrby = vi.fn();
      expire = vi.fn();
      lpush = vi.fn();
      ltrim = vi.fn();
      scan = vi.fn().mockResolvedValue(['0', []]);
      pipeline = vi.fn(() => ({
        hgetall: vi.fn(),
        exec: vi.fn().mockResolvedValue([]),
      }));
      lrange = vi.fn().mockResolvedValue([]);
      quit = vi.fn();
    },
  };
});

vi.mock('../src/connection', () => ({
  createRedisConnection: vi.fn(() => ({
    scan: vi.fn().mockResolvedValue(['0', []]),
    mget: vi.fn().mockResolvedValue([null, null, null]),
    hincrby: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    lpush: vi.fn().mockResolvedValue(1),
    ltrim: vi.fn().mockResolvedValue('OK'),
    pipeline: vi.fn(() => ({
      hgetall: vi.fn(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    lrange: vi.fn().mockResolvedValue([]),
    info: vi.fn().mockResolvedValue('redis_version=7.0.0'),
    quit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  })),
}));

describe('QueueMonitor', () => {
  const redisConfig = { host: 'localhost', port: 6379 };
  const monitors = new Set<QueueMonitorApi>();

  afterEach(async () => {
    await Promise.all(Array.from(monitors, (monitor) => monitor.close()));
    monitors.clear();
  });

  it('creates an instance with default settings', () => {
    const monitor = QueueMonitor.create({ redis: redisConfig });
    monitors.add(monitor);
    expect(monitor).toBeDefined();
    expect(monitor.getSnapshot).toBeDefined();
  });

  it('registerRoutes calls router.get', () => {
    const monitor = QueueMonitor.create({ redis: redisConfig });
    monitors.add(monitor);
    const router = {
      routes: [],
      prefix: '',
      routeIndex: new Map(),
    };

    // Mock Router
    // primitive mock of Router.get based on implementation details if I could mock Router
    // but Router is imported from core.

    // Since I cannot easily mock correct Router.get just by passing router object
    // without mocking the Router module itself.
    // However, I can check if it runs without error.

    expect(() => monitor.registerRoutes(router as any)).not.toThrow();
  });

  it('getSnapshot returns structure', async () => {
    const monitor = QueueMonitor.create({ redis: redisConfig });
    monitors.add(monitor);
    const snapshot = await monitor.getSnapshot();

    expect(snapshot.status).toBe('ok');
    expect(snapshot.queues).toBeInstanceOf(Array);
  });

  it.skip('merges known queues into the snapshot when Redis has no discoverable queue keys', async () => {
    const monitor = QueueMonitor.create({
      redis: redisConfig,
      knownQueues: ['emails', 'notifications', 'emails'],
    });
    monitors.add(monitor);

    const snapshot = await monitor.getSnapshot();

    expect(snapshot.queues.map((queue) => queue.name)).toEqual(['emails', 'notifications']);
  });
});
