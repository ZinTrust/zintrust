import { afterEach, describe, expect, it, vi } from 'vitest';

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createStorage = () => ({
  writeEntry: vi.fn().mockResolvedValue(undefined),
  updateEntry: vi.fn().mockResolvedValue(undefined),
  markFamilyStale: vi.fn().mockResolvedValue(undefined),
});

describe('system trace watcher lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reference-counts ExceptionWatcher process listeners', async () => {
    vi.resetModules();

    const onSpy = vi.spyOn(process, 'on');
    const offSpy = vi.spyOn(process, 'off');
    const { ExceptionWatcher } = await import('../../src/watchers/ExceptionWatcher');
    const storage = createStorage();
    const config = { watchers: { exception: true } } as any;

    const unregisterA = ExceptionWatcher.register({ storage, config });
    const unregisterB = ExceptionWatcher.register({ storage, config });

    expect(onSpy).toHaveBeenCalledTimes(2);

    ExceptionWatcher.capture(new Error('boom'));
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);
    expect(storage.markFamilyStale).toHaveBeenCalledTimes(1);

    unregisterA();
    expect(offSpy).not.toHaveBeenCalled();

    unregisterB();
    expect(offSpy).toHaveBeenCalledTimes(2);
  });

  it('updates pending jobs and clears pending state across unregister cycles', async () => {
    vi.resetModules();

    const { JobWatcher } = await import('../../src/watchers/JobWatcher');
    const storage = createStorage();
    const config = { watchers: { job: true } } as any;

    const unregister = JobWatcher.register({ storage, config });

    JobWatcher.onDispatch('emails', 'mail', 'redis', { id: 1 });
    await flushAsync();

    expect(storage.writeEntry).toHaveBeenCalledTimes(1);

    const writtenEntry = storage.writeEntry.mock.calls[0]?.[0] as { uuid: string };

    JobWatcher.onProcessed('emails');
    await flushAsync();

    expect(storage.updateEntry).toHaveBeenCalledWith(
      writtenEntry.uuid,
      expect.objectContaining({
        content: expect.objectContaining({ status: 'processed' }),
      })
    );

    unregister();

    const unregisterAgain = JobWatcher.register({ storage, config });
    JobWatcher.onProcessed('emails');
    await flushAsync();

    expect(storage.updateEntry).toHaveBeenCalledTimes(1);
    unregisterAgain();
  });

  it('records failed jobs with exception details', async () => {
    vi.resetModules();

    const { JobWatcher } = await import('../../src/watchers/JobWatcher');
    const storage = createStorage();
    const config = { watchers: { job: true } } as any;
    const unregister = JobWatcher.register({ storage, config });

    JobWatcher.onDispatch('reports', 'default', 'database', { id: 2 });
    await flushAsync();

    const writtenEntry = storage.writeEntry.mock.calls[0]?.[0] as { uuid: string };

    JobWatcher.onFailed('reports', new Error('failed hard'));
    await flushAsync();

    expect(storage.updateEntry).toHaveBeenCalledWith(
      writtenEntry.uuid,
      expect.objectContaining({
        content: expect.objectContaining({
          status: 'failed',
          exception: expect.objectContaining({ message: 'failed hard' }),
        }),
      })
    );

    unregister();
  });
});
