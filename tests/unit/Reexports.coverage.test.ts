import { describe, expect, it } from 'vitest';

describe('Re-export modules (coverage)', () => {
  it('re-exports UserQueryBuilderController as UserController (compat)', async () => {
    const { UserQueryBuilderController } =
      await import('@app/Controllers/UserQueryBuilderController');
    const userControllerModule = await import('@app/Controllers/UserController');
    const userControllerSource = await import('@app/Controllers/UserController');

    expect(userControllerModule.UserController).toBe(UserQueryBuilderController);
    expect(userControllerModule.UserQueryBuilderController).toBe(UserQueryBuilderController);
    expect(userControllerModule.default).toBe(UserQueryBuilderController);

    expect(userControllerSource.UserController).toBe(UserQueryBuilderController);
    expect(userControllerSource.default).toBe(UserQueryBuilderController);
  });

  it('re-exports route registrars from src/routes/*', async () => {
    const api = await import('@/routes/api');
    const broadcast = await import('@/routes/broadcast');
    const health = await import('@routes/health');
    const metrics = await import('@/routes/metrics');
    const storage = await import('@/routes/storage');

    const apiImpl = await import('@routes/api');
    const broadcastImpl = await import('@routes/broadcast');
    const healthImpl = await import('@routes/health');
    const metricsImpl = await import('@routes/metrics');
    const storageImpl = await import('@routes/storage');

    expect(api.registerRoutes).toBe(apiImpl.registerRoutes);
    expect(broadcast.registerBroadcastRoutes).toBe(broadcastImpl.registerBroadcastRoutes);
    expect(health.registerHealthRoutes).toBe(healthImpl.registerHealthRoutes);
    expect(metrics.registerMetricsRoutes).toBe(metricsImpl.registerMetricsRoutes);

    expect(storage.registerStorageRoutes).toBe(storageImpl.registerStorageRoutes);
    expect(storage.default).toBe(storageImpl.default);
  });

  it('re-exports collections/events/testing barrels', async () => {
    const collections = await import('@/collections');
    const collectionImpl = await import('@/collections/Collection');

    await import('@/collections/index');

    expect(collections.collect).toBe(collectionImpl.collect);
    expect(collections.Collection).toBe(collectionImpl.Collection);

    const events = await import('@/events');
    const eventsImpl = await import('@events/EventDispatcher');
    expect(events.EventDispatcher).toBe(eventsImpl.EventDispatcher);

    await import('@/events/index');

    const testing = await import('@/testing');
    const testEnvImpl = await import('@/testing/TestEnvironment');
    const testHttpImpl = await import('@/testing/TestHttp');

    await import('@/testing/index');

    expect(testing.TestEnvironment).toBe(testEnvImpl.TestEnvironment);
    expect(testing.TestHttp).toBe(testHttpImpl.TestHttp);
  });

  it('imports app/Types/controller.ts (type-only module) without crashing', async () => {
    const mod = await import('@app/Types/controller');
    await import('../../app/Types/controller');
    expect(mod).toBeDefined();
  });
});
