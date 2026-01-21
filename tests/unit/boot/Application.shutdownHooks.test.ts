import { describe, expect, it, vi } from 'vitest';

vi.mock('@orm/ConnectionManager', () => ({
  ConnectionManager: { shutdownIfInitialized: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@orm/Database', () => ({ resetDatabase: vi.fn() }));
vi.mock('@cache/Cache', () => ({ Cache: { reset: vi.fn() } }));
vi.mock('@config/FileLogWriter', () => ({ FileLogWriter: { flush: vi.fn() } }));
vi.mock('@broadcast/BroadcastRegistry', () => ({ BroadcastRegistry: { reset: vi.fn() } }));
vi.mock('@storage/StorageDiskRegistry', () => ({ StorageDiskRegistry: { reset: vi.fn() } }));
vi.mock('@notification/NotificationChannelRegistry', () => ({
  NotificationChannelRegistry: { reset: vi.fn() },
}));
vi.mock('@mail/MailDriverRegistry', () => ({ MailDriverRegistry: { reset: vi.fn() } }));
vi.mock('@tools/queue/Queue', () => ({ Queue: { reset: vi.fn() } }));
vi.mock('@zintrust/workers', () => ({
  WorkerShutdown: { shutdown: vi.fn().mockResolvedValue(undefined) },
}));

describe('Application shutdown hooks', () => {
  it('registers shutdown hooks and runs them', async () => {
    vi.resetModules();

    const { Application } = await import('@boot/Application');
    const app = Application.create('/tmp');

    await new Promise((resolve) => setTimeout(resolve, 10));

    await app.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const { ConnectionManager } = await import('@orm/ConnectionManager');
    const { resetDatabase } = await import('@orm/Database');
    const { Cache } = await import('@cache/Cache');
    const { FileLogWriter } = await import('@config/FileLogWriter');
    const { BroadcastRegistry } = await import('@broadcast/BroadcastRegistry');
    const { StorageDiskRegistry } = await import('@storage/StorageDiskRegistry');
    const { NotificationChannelRegistry } =
      await import('@notification/NotificationChannelRegistry');
    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { Queue } = await import('@tools/queue/Queue');
    const { WorkerShutdown } = await import('@zintrust/workers');

    expect(ConnectionManager.shutdownIfInitialized).toHaveBeenCalled();
    expect(resetDatabase).toHaveBeenCalled();
    expect(Cache.reset).toHaveBeenCalled();
    expect(FileLogWriter.flush).toHaveBeenCalled();
    expect(BroadcastRegistry.reset).toHaveBeenCalled();
    expect(StorageDiskRegistry.reset).toHaveBeenCalled();
    expect(NotificationChannelRegistry.reset).toHaveBeenCalled();
    expect(MailDriverRegistry.reset).toHaveBeenCalled();
    expect(Queue.reset).toHaveBeenCalled();
    expect(WorkerShutdown.shutdown).toHaveBeenCalled();
  });
});
