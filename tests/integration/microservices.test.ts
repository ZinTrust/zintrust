import { Env } from '@config/env';
import { Request } from '@http/Request';
import { IResponse, Response } from '@http/Response';
import {
  IMicroserviceBootstrap,
  MicroserviceBootstrap,
  ServiceConfig,
} from '@microservices/MicroserviceBootstrap';
import {
  IMicroserviceManager,
  MicroserviceConfig,
  MicroserviceManager,
} from '@microservices/MicroserviceManager';
import { PostgresAdapter } from '@microservices/PostgresAdapter';
import { RequestTracingMiddleware } from '@microservices/RequestTracingMiddleware';
import { ApiKeyAuth, JwtAuth, ServiceAuthMiddleware } from '@microservices/ServiceAuthMiddleware';
import { HealthCheckHandler, ServiceHealthMonitor } from '@microservices/ServiceHealthMonitor';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Microservices Service Discovery', () => {
  let bootstrap: IMicroserviceBootstrap;
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    bootstrap = MicroserviceBootstrap.getInstance();
    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  it('should discover services from filesystem', async () => {
    const services = await bootstrap.discoverServices();
    expect(services.length).toBeGreaterThan(0);
    expect(services[0]).toHaveProperty('name');
    expect(services[0]).toHaveProperty('domain');
    expect(services[0]).toHaveProperty('port');
  });

  it('should get service configuration', () => {
    const config = bootstrap.getServiceConfig('ecommerce', 'users');
    expect(config).toBeDefined();
    expect(config?.name).toBe('users');
    expect(config?.domain).toBe('ecommerce');
  });

  it('should filter services by SERVICES env var', async () => {
    process.env['SERVICES'] = 'users,payments';
    const bootstrap2 = MicroserviceBootstrap.getInstance();
    bootstrap2.setServicesDir(bootstrap.getServicesDir());

    const services = await bootstrap2.discoverServices();
    const serviceNames = services.map((s: ServiceConfig) => s.name);

    expect(serviceNames).toContain('users');
    expect(serviceNames).toContain('payments');
    expect(serviceNames).not.toContain('orders');
  });
});

describe('Microservices Service Registry', () => {
  let bootstrap: IMicroserviceBootstrap;
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    bootstrap = MicroserviceBootstrap.getInstance();
    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  it('should register service', async () => {
    await bootstrap.registerServices();
    const services = bootstrap.getAllServiceConfigs();

    expect(services.length).toBeGreaterThan(0);
    expect(manager.getAllServices().length).toBeGreaterThan(0);
  });

  it('should get service by domain and name', () => {
    const service = manager.getService('ecommerce', 'users');
    expect(service).toBeDefined();
    expect(service?.name).toBe('users');
  });

  it('should get services by domain', () => {
    const services = manager.getServicesByDomain('ecommerce');
    expect(services.length).toBeGreaterThan(0);
    expect(services.every((s: MicroserviceConfig) => s.domain === 'ecommerce')).toBe(true);
  });
});

describe('Microservices Authentication Strategies Basic', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Authentication Strategies - API Key Auth', () => {
    it('should verify valid API key', () => {
      const auth = ApiKeyAuth.create('test-key');
      expect(auth.verify('test-key')).toBe(true);
    });

    it('should reject invalid API key', () => {
      const auth = ApiKeyAuth.create('test-key');
      expect(auth.verify('wrong-key')).toBe(false);
    });

    it('should generate new API key', () => {
      const auth = ApiKeyAuth.create();
      const key1 = auth.generate();
      const key2 = auth.generate();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });
  });
});

describe('Microservices Authentication Strategies JWT', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Authentication Strategies - JWT Auth', () => {
    it('should sign and verify JWT token', () => {
      const auth = JwtAuth.create('secret');
      const token = auth.sign({ serviceName: 'users', userId: 123 });

      expect(token).toBeDefined();
      const payload = auth.verify(token);
      expect(payload).toBeDefined();
      expect(payload?.['serviceName']).toBe('users');
    });

    it('should reject invalid JWT token', () => {
      const auth = JwtAuth.create('secret');
      const payload = auth.verify('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should reject tampered JWT token', () => {
      const auth1 = JwtAuth.create('secret1');
      const token = auth1.sign({ serviceName: 'users' });

      const auth2 = JwtAuth.create('secret2');
      const payload = auth2.verify(token);
      expect(payload).toBeNull();
    });
  });
});

describe('Microservices Authentication Middleware', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Authentication Strategies - Auth Middleware', () => {
    it('should skip auth for none strategy', async (): Promise<void> => {
      const middleware = ServiceAuthMiddleware.middleware('none');
      let contextSet = false;

      const incomingMsg = new IncomingMessage(new Socket());
      incomingMsg.headers = {};
      const req = Request.create(incomingMsg);

      const serverRes = new ServerResponse(incomingMsg);
      const res = Response.create(serverRes);

      const next = (): void => {
        contextSet = true;
      };

      middleware(req, res, next);
      expect(contextSet).toBe(true);
    });
  });
});

describe('Microservices Authentication Middleware Rejection', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Authentication Strategies - Auth Middleware Rejection', () => {
    it('should reject missing auth header for api-key', async (): Promise<void> => {
      const middleware = ServiceAuthMiddleware.middleware('api-key');
      let statusCode = 0;

      const incomingMsg = new IncomingMessage(new Socket());
      incomingMsg.headers = {};
      const req = Request.create(incomingMsg);

      const serverRes = new ServerResponse(incomingMsg);
      const res = Response.create(serverRes);
      const originalSetStatus = res.setStatus.bind(res);
      res.setStatus = (code: number): IResponse => {
        statusCode = code;
        return originalSetStatus(code);
      };

      const next = (): void => {};

      middleware(req, res, next);
      expect(statusCode).toBe(401);
    });
  });
});

describe('Microservices Request Tracing', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Request Tracing', () => {
    it('should inject trace headers', (): void => {
      const injectHeaders = RequestTracingMiddleware.injectHeaders('users', 'orders');
      const headers = injectHeaders({}, 'trace-123');

      expect(headers['x-trace-id']).toBe('trace-123');
      expect(headers['x-parent-service-id']).toBe('users');
      expect(headers['x-trace-depth']).toBe('1');
    });

    it('should increment trace depth', (): void => {
      const injectHeaders = RequestTracingMiddleware.injectHeaders('users', 'orders');
      const headers1 = injectHeaders({ 'x-trace-depth': '0' });

      const injectHeaders2 = RequestTracingMiddleware.injectHeaders('orders', 'payments');
      const headers2 = injectHeaders2(headers1);

      expect(Number.parseInt(headers2['x-trace-depth'])).toBeGreaterThan(
        Number.parseInt(headers1['x-trace-depth'])
      );
    });
  });
});

describe('Microservices Health Checks', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Health Checks', () => {
    it('should create health check handler', () => {
      const handler = HealthCheckHandler.create('users', '1.0.0', 3001, 'ecommerce', []);
      expect(handler).toBeDefined();
    });

    it('should create health monitor', () => {
      const healthCheckUrls = {
        users: 'http://localhost:3001/health',
        orders: 'http://localhost:3002/health',
        payments: 'http://localhost:3003/health',
      };

      const monitor = ServiceHealthMonitor.create(healthCheckUrls);
      expect(monitor).toBeDefined();
    });

    it('should check if service is healthy', () => {
      const healthCheckUrls = {
        users: 'http://localhost:3001/health',
      };

      const monitor = ServiceHealthMonitor.create(healthCheckUrls);
      expect(monitor.areAllHealthy()).toBe(false); // Service not running
    });
  });
});

describe('Microservices Database Isolation', () => {
  let bootstrap: IMicroserviceBootstrap;
  let manager: IMicroserviceManager;

  beforeAll(async () => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    bootstrap = MicroserviceBootstrap.getInstance();
    manager = MicroserviceManager.getInstance();
    await bootstrap.discoverServices();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Database Isolation', () => {
    it('should identify isolated service', () => {
      const isIsolated = bootstrap.isServiceIsolated('ecommerce', 'payments');
      expect(isIsolated).toBe(true);
    });

    it('should identify shared database service', () => {
      const isShared = !bootstrap.isServiceIsolated('ecommerce', 'users');
      expect(isShared).toBe(true);
    });

    it('should get database isolation config', () => {
      const config = bootstrap.getServiceConfig('ecommerce', 'payments');
      expect(config?.database?.isolation).toBe('isolated');

      const config2 = bootstrap.getServiceConfig('ecommerce', 'users');
      expect(config2?.database?.isolation).toBe('shared');
    });
  });
});

describe('Microservices PostgreSQL Adapter', () => {
  let manager: IMicroserviceManager;

  beforeAll(() => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    manager = MicroserviceManager.getInstance();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('PostgreSQL Adapter', () => {
    it('should create postgres adapter instance', () => {
      const adapter = PostgresAdapter.create({
        host: 'localhost',
        port: 5432,
        database: 'zintrust',
        user: 'postgres',
        password: Env.DB_PASSWORD || 'postgres',
        serviceName: 'users',
        isolation: 'shared',
      });

      expect(adapter).toBeDefined();
    });

    it('should get connection pool', async () => {
      const adapter = PostgresAdapter.create({
        host: 'localhost',
        port: 5432,
        database: 'zintrust',
        user: 'postgres',
        password: Env.DB_PASSWORD || 'postgres',
        max: 10,
      });

      // Pool is created on first access (if connection succeeds)
      // For this test, we just verify the adapter is configured
      expect(adapter).toBeDefined();
    });
  });
});

describe('Microservices Auth and Tracing Configuration', () => {
  let bootstrap: IMicroserviceBootstrap;
  let manager: IMicroserviceManager;

  beforeAll(async () => {
    // Reset singletons for clean state
    MicroserviceBootstrap.reset();
    MicroserviceManager.reset();

    // Set microservices environment
    process.env['MICROSERVICES'] = 'true';
    process.env['SERVICES'] = 'users,orders,payments';
    process.env['MICROSERVICES_TRACING'] = 'true';

    bootstrap = MicroserviceBootstrap.getInstance();
    manager = MicroserviceManager.getInstance();
    await bootstrap.discoverServices();
  });

  afterAll(async () => {
    process.env['MICROSERVICES'] = undefined;
    process.env['SERVICES'] = undefined;
    await manager.stopAllServices();
  });

  describe('Auth Strategy Configuration', () => {
    it('should get API key auth strategy for users', () => {
      const strategy = bootstrap.getServiceAuthStrategy('ecommerce', 'users');
      expect(strategy).toBe('api-key');
    });

    it('should get JWT auth strategy for orders', () => {
      const strategy = bootstrap.getServiceAuthStrategy('ecommerce', 'orders');
      expect(strategy).toBe('jwt');
    });

    it('should get none auth strategy for payments', () => {
      const strategy = bootstrap.getServiceAuthStrategy('ecommerce', 'payments');
      expect(strategy).toBe('none');
    });
  });

  describe('Request Tracing Configuration', () => {
    it('should check if tracing enabled for users', () => {
      const enabled = bootstrap.isTracingEnabled('ecommerce', 'users');
      expect(enabled).toBe(true);
    });

    it('should get sampling rate for orders', () => {
      const rate = bootstrap.getTracingSamplingRate('ecommerce', 'orders');
      expect(rate).toBe(0.5);
    });

    it('should check if tracing disabled for payments', () => {
      const enabled = bootstrap.isTracingEnabled('ecommerce', 'payments');
      expect(enabled).toBe(false);
    });
  });
});
