import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShutdownTrace } from '@helper/ShutdownTrace';

describe('ShutdownTrace', () => {
  const originalShutdownTrace = process.env.SHUTDOWN_TRACE;
  const originalDebugShutdownTrace = process.env.DEBUG_SHUTDOWN_TRACE;
  const originalWorkerShutdownTrace = process.env.WORKER_SHUTDOWN_TRACE;
  const originalGetActiveHandles = (
    process as typeof process & { _getActiveHandles?: () => unknown[] }
  )._getActiveHandles;
  const originalGetActiveRequests = (
    process as typeof process & { _getActiveRequests?: () => unknown[] }
  )._getActiveRequests;

  beforeEach(() => {
    delete process.env.SHUTDOWN_TRACE;
    delete process.env.DEBUG_SHUTDOWN_TRACE;
    delete process.env.WORKER_SHUTDOWN_TRACE;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalShutdownTrace === undefined) delete process.env.SHUTDOWN_TRACE;
    else process.env.SHUTDOWN_TRACE = originalShutdownTrace;

    if (originalDebugShutdownTrace === undefined) delete process.env.DEBUG_SHUTDOWN_TRACE;
    else process.env.DEBUG_SHUTDOWN_TRACE = originalDebugShutdownTrace;

    if (originalWorkerShutdownTrace === undefined) delete process.env.WORKER_SHUTDOWN_TRACE;
    else process.env.WORKER_SHUTDOWN_TRACE = originalWorkerShutdownTrace;

    (process as typeof process & { _getActiveHandles?: () => unknown[] })._getActiveHandles =
      originalGetActiveHandles;
    (process as typeof process & { _getActiveRequests?: () => unknown[] })._getActiveRequests =
      originalGetActiveRequests;
  });

  it('does not write anything when tracing is disabled', () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    ShutdownTrace.log('disabled');
    ShutdownTrace.logHandles('disabled.handles');
    ShutdownTrace.logBullMQWorker('disabled.worker', {});

    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('logs handles and worker details when tracing is enabled', () => {
    process.env.SHUTDOWN_TRACE = ' On ';

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    (process as typeof process & { _getActiveHandles?: () => unknown[] })._getActiveHandles = () => [
      {
        constructor: { name: 'Socket' },
        fd: 1,
        localPort: 3000,
        remotePort: 6379,
        _repeat: 250,
        destroyed: false,
        hasRef: () => true,
      },
      {
        constructor: { name: 123 },
      },
    ];
    (process as typeof process & { _getActiveRequests?: () => unknown[] })._getActiveRequests =
      () => [
        {
          constructor: { name: 'Request' },
          hasRef: () => {
            throw new Error('boom');
          },
        },
      ];

    ShutdownTrace.log('plain', { phase: 'start' });
    ShutdownTrace.logHandles('handles', { scope: 'runtime' });
    ShutdownTrace.logBullMQWorker(
      'worker',
      {
        constructor: { name: 'Worker' },
        name: 'emails',
        closing: Promise.resolve(),
        opts: {
          prefix: 'bull',
          concurrency: 3,
          autorun: true,
          connection: { constructor: { name: 'Redis' } },
        },
      },
      { workerName: 'mail-worker' }
    );

    const calls = stderrWrite.mock.calls.map(([line]) => String(line).trim());

    expect(calls).toHaveLength(3);

    const plainLog = JSON.parse(calls[0] ?? '{}');
    expect(plainLog).toMatchObject({
      level: 'info',
      trace: 'shutdown',
      label: 'plain',
      details: { phase: 'start' },
    });

    const handlesLog = JSON.parse(calls[1] ?? '{}');
    expect(handlesLog.label).toBe('handles');
    expect(handlesLog.details.handleCount).toBe(2);
    expect(handlesLog.details.requestCount).toBe(1);
    expect(handlesLog.details.handleTypes.Socket).toBe(1);
    expect(handlesLog.details.requestTypes.Request).toBe(1);
    expect(handlesLog.details.handles[0]).toMatchObject({
      type: 'Socket',
      fd: 1,
      localPort: 3000,
      remotePort: 6379,
      repeatMs: 250,
      destroyed: false,
      hasRef: true,
    });
    expect(handlesLog.details.requests[0]).toMatchObject({
      type: 'Request',
      hasRef: 'error',
    });

    const workerLog = JSON.parse(calls[2] ?? '{}');
    expect(workerLog.details).toMatchObject({
      workerType: 'Worker',
      workerName: 'mail-worker',
      queueName: 'emails',
      prefix: 'bull',
      concurrency: 3,
      autorun: true,
      connectionType: 'Redis',
      closingState: 'Promise',
    });
  });
});