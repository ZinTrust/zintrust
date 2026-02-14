import { Env } from '@/config/env';
import { JobRecoveryDaemon } from '@/tools/queue/JobRecoveryDaemon';
import { JobStateTracker } from '@/tools/queue/JobStateTracker';
import { Queue, type IQueueDriver } from '@/tools/queue/Queue';
import { beforeEach, describe, expect, it } from 'vitest';

const clearReplayEnv = (): void => {
  Env.unset('DLQ_REPLAY_ALLOWED_ACTORS');
  Env.unset('DLQ_REPLAY_MAX_BATCH_SIZE');
  Env.unset('DLQ_REPLAY_MAX_QPS');
  Env.unset('DLQ_REPLAY_MIN_AGE_MS');
};

describe('JobRecoveryDaemon DLQ replay governance', () => {
  beforeEach(() => {
    clearReplayEnv();
    JobStateTracker.reset();
    Queue.reset();
  });

  it('replays dead-letter jobs with reason code and lineage metadata', async () => {
    const capturedPayloads: Array<Record<string, unknown>> = [];
    let sequence = 0;

    const driver: IQueueDriver = {
      enqueue: async (_queue, payload) => {
        capturedPayloads.push(payload as Record<string, unknown>);
        sequence += 1;
        return `replay-${sequence}`;
      },
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    };

    Queue.register('inmemory', driver);

    await JobStateTracker.enqueued({
      queueName: 'emails',
      jobId: 'dead-1',
      payload: { to: 'user@example.com', template: 'receipt' },
      maxAttempts: 3,
    });

    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'dead-1',
      status: 'dead_letter',
      reason: 'Initial failure escalation',
    });

    Env.set('DLQ_REPLAY_MIN_AGE_MS', '0');

    const result = await JobRecoveryDaemon.replayDeadLetter({
      reasonCode: 'bug_fixed',
      replayedBy: 'ops-user',
      queueName: 'emails',
      limit: 10,
      maxPerSecond: 1000,
      minAgeMs: 0,
    });

    expect(result.replayed).toBe(1);
    expect(result.scanned).toBe(1);

    const firstPayload = capturedPayloads[0];
    expect(firstPayload).toBeDefined();
    expect(Array.isArray(firstPayload['__dlqReplayLineage'])).toBe(true);

    const lineage = (firstPayload['__dlqReplayLineage'] as Array<Record<string, unknown>>)[0];
    expect(lineage['originalJobId']).toBe('dead-1');
    expect(lineage['replayReasonCode']).toBe('bug_fixed');
    expect(lineage['replayedBy']).toBe('ops-user');

    const originalTransitions = JobStateTracker.getTransitions({
      queueName: 'emails',
      jobId: 'dead-1',
    });

    expect(
      originalTransitions.some((transition) =>
        transition.reason.includes('DLQ replayed (bug_fixed) by ops-user as replay-1')
      )
    ).toBe(true);

    const replayedRecord = JobStateTracker.get('emails', 'replay-1');
    expect(replayedRecord?.status).toBe('pending');
  });

  it('enforces replay actor allow-list policy', async () => {
    Queue.register('inmemory', {
      enqueue: async () => 'replay-1',
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    });

    await JobStateTracker.enqueued({
      queueName: 'emails',
      jobId: 'dead-2',
      payload: { to: 'user@example.com' },
      maxAttempts: 3,
    });

    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'dead-2',
      status: 'dead_letter',
      reason: 'Initial failure escalation',
    });

    Env.set('DLQ_REPLAY_ALLOWED_ACTORS', 'ops-admin');

    await expect(
      JobRecoveryDaemon.replayDeadLetter({
        reasonCode: 'operator_override',
        replayedBy: 'unauthorized-user',
        queueName: 'emails',
      })
    ).rejects.toThrow(/not allowed/);
  });

  it('respects replay batch ceiling', async () => {
    let sequence = 0;
    Queue.register('inmemory', {
      enqueue: async () => {
        sequence += 1;
        return `replay-${sequence}`;
      },
      dequeue: async () => undefined,
      ack: async () => undefined,
      length: async () => 0,
      drain: async () => undefined,
    });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'dead-3', payload: { id: 1 } });
    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'dead-3',
      status: 'dead_letter',
      reason: 'Escalated',
    });

    await JobStateTracker.enqueued({ queueName: 'emails', jobId: 'dead-4', payload: { id: 2 } });
    await JobStateTracker.setTerminalStatus({
      queueName: 'emails',
      jobId: 'dead-4',
      status: 'dead_letter',
      reason: 'Escalated',
    });

    Env.set('DLQ_REPLAY_MAX_BATCH_SIZE', '1');
    Env.set('DLQ_REPLAY_MIN_AGE_MS', '0');

    const result = await JobRecoveryDaemon.replayDeadLetter({
      reasonCode: 'transient_dependency',
      replayedBy: 'ops-admin',
      queueName: 'emails',
      limit: 25,
      maxPerSecond: 1000,
      minAgeMs: 0,
    });

    expect(result.replayed).toBe(1);
    expect(result.scanned).toBe(1);
  });
});
