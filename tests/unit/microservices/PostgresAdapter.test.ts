import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/logger');

const monkpass = 'testpass';
describe('PostgresAdapter', () => {
  let PostgresAdapter: any;

  beforeEach(async () => {
    const module = await import('@/microservices/PostgresAdapter');
    PostgresAdapter = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with shared mode config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should create instance with isolated mode config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'isolated' as const,
        serviceName: 'auth-service',
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should create instance with pool size config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'shared' as const,
        max: 20,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should create instance with idle timeout config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'shared' as const,
        idleTimeoutMillis: 30000,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should create instance with connection timeout config', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'shared' as const,
        connectionTimeoutMillis: 5000,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });
  });

  describe('Pool Key Generation', () => {
    it('should generate key for shared mode', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'shared-db',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const adapter = new PostgresAdapter(config);
      const key = adapter.getPoolKey();

      expect(key).toBe('localhost:5432/shared-db');
    });

    it('should generate key for isolated mode with service name', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'isolated' as const,
        serviceName: 'user-service',
      };

      const adapter = new PostgresAdapter(config);
      const key = adapter.getPoolKey();

      expect(key).toBe('localhost:5432/user-service');
    });

    it('should generate key for isolated mode without service name', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'isolated' as const,
      };

      const adapter = new PostgresAdapter(config);
      const key = adapter.getPoolKey();

      expect(key).toBe('localhost:5432/testdb');
    });

    it('should handle different host and port', () => {
      const config = {
        host: 'db.example.com',
        port: 5433,
        database: 'mydb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const adapter = new PostgresAdapter(config);
      const key = adapter.getPoolKey();

      expect(key).toBe('db.example.com:5433/mydb');
    });
  });

  describe('Global Instance Management', () => {
    let module: any;

    beforeEach(async () => {
      module = await import('@/microservices/PostgresAdapter');
    });

    it('should get or create instance with default key', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const instance1 = module.getInstance(config);
      const instance2 = module.getInstance(config);

      expect(instance1).toBe(instance2);
    });

    it('should get or create instance with custom key', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const instance1 = module.getInstance(config, 'auth-service');
      const instance2 = module.getInstance(config, 'auth-service');

      expect(instance1).toBe(instance2);
    });

    it('should create separate instances with different keys', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const instance1 = module.getInstance(config, 'auth-service');
      const instance2 = module.getInstance(config, 'user-service');

      expect(instance1).not.toBe(instance2);
    });

    it('should get all instances', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const before = module.getAllInstances().length;
      module.getInstance(config, 'service1');
      module.getInstance(config, 'service2');

      const after = module.getAllInstances().length;

      expect(after).toBeGreaterThanOrEqual(before + 2);
    });

    it('should access through PostgresAdapterManager', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const manager = module.PostgresAdapterManager;
      const instance = manager.getInstance(config, 'manager-test');

      expect(instance).toBeDefined();
      expect(manager.getAllInstances()).toBeDefined();
    });
  });

  describe('Instance Methods', () => {
    let adapter: any;

    beforeEach(() => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'shared' as const,
      };

      adapter = new PostgresAdapter(config);
    });

    it('should have connect method', () => {
      expect(typeof adapter.connect).toBe('function');
    });

    it('should have query method', () => {
      expect(typeof adapter.query).toBe('function');
    });

    it('should have execute method', () => {
      expect(typeof adapter.execute).toBe('function');
    });

    it('should have transaction method', () => {
      expect(typeof adapter.transaction).toBe('function');
    });

    it('should have getPoolStats method', () => {
      expect(typeof adapter.getPoolStats).toBe('function');
    });

    it('should have getPool method', () => {
      expect(typeof adapter.getPool).toBe('function');
    });

    it('should have disconnect method', () => {
      expect(typeof adapter.disconnect).toBe('function');
    });

    it('should have disconnectAll method', () => {
      expect(typeof adapter.disconnectAll).toBe('function');
    });

    it('should have createServiceSchema method', () => {
      expect(typeof adapter.createServiceSchema).toBe('function');
    });

    it('should have runMigrations method', () => {
      expect(typeof adapter.runMigrations).toBe('function');
    });

    it('should have healthCheck method', () => {
      expect(typeof adapter.healthCheck).toBe('function');
    });
  });

  describe('Pool Statistics without Connection', () => {
    let adapter: any;

    beforeEach(() => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: monkpass,
        isolation: 'shared' as const,
      };

      adapter = new PostgresAdapter(config);
    });

    it('should throw error when getting stats without connection', () => {
      expect(() => {
        adapter.getPoolStats();
      }).toThrow('Connection pool not initialized');
    });
  });

  describe('Shared vs Isolated Mode', () => {
    it('should handle shared mode configuration', () => {
      const sharedAdapter = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'shared-db',
        user: 'user',
        password: monkpass,
        isolation: 'shared',
      });

      const key = sharedAdapter.getPoolKey();
      expect(key).toContain('shared-db');
    });

    it('should handle isolated mode with service name', () => {
      const isolatedAdapter = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'isolated',
        serviceName: 'auth-service',
      });

      const key = isolatedAdapter.getPoolKey();
      expect(key).toContain('auth-service');
      expect(key).not.toContain('testdb');
    });

    it('should generate different keys for different services', () => {
      const auth = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'isolated',
        serviceName: 'auth-service',
      });

      const user = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'isolated',
        serviceName: 'user-service',
      });

      const authKey = auth.getPoolKey();
      const userKey = user.getPoolKey();

      expect(authKey).not.toBe(userKey);
    });

    it('should generate same key for same shared configuration', () => {
      const adapter1 = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'shared-db',
        user: 'user',
        password: monkpass,
        isolation: 'shared',
      });

      const adapter2 = new PostgresAdapter({
        host: 'localhost',
        port: 5432,
        database: 'shared-db',
        user: 'user',
        password: monkpass,
        isolation: 'shared',
      });

      const key1 = adapter1.getPoolKey();
      const key2 = adapter2.getPoolKey();

      expect(key1).toBe(key2);
    });
  });

  describe('Configuration Options', () => {
    it('should handle all configuration options', () => {
      const config = {
        host: 'db.example.com',
        port: 5433,
        database: 'mydb',
        user: 'myuser',
        password: monkpass,
        isolation: 'isolated' as const,
        serviceName: 'my-service',
        max: 30,
        idleTimeoutMillis: 20000,
        connectionTimeoutMillis: 10000,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should handle minimal configuration', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should accept optional max pool size', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
        max: 50,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should accept optional idle timeout', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
        idleTimeoutMillis: 25000,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should accept optional connection timeout', () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'user',
        password: monkpass,
        isolation: 'shared' as const,
        connectionTimeoutMillis: 3000,
      };

      const adapter = new PostgresAdapter(config);
      expect(adapter).toBeDefined();
    });
  });

  describe('Export Functions', () => {
    let module: any;

    beforeEach(async () => {
      module = await import('@/microservices/PostgresAdapter');
    });

    it('should export getInstance function', () => {
      expect(typeof module.getInstance).toBe('function');
    });

    it('should export getAllInstances function', () => {
      expect(typeof module.getAllInstances).toBe('function');
    });

    it('should export disconnectAll function', () => {
      expect(typeof module.disconnectAll).toBe('function');
    });

    it('should export PostgresAdapterManager', () => {
      expect(module.PostgresAdapterManager).toBeDefined();
      expect(typeof module.PostgresAdapterManager.getInstance).toBe('function');
      expect(typeof module.PostgresAdapterManager.getAllInstances).toBe('function');
      expect(typeof module.PostgresAdapterManager.disconnectAll).toBe('function');
    });

    it('should export default as PostgresAdapter', () => {
      expect(typeof module.default).toBe('function');
    });
  });
});
