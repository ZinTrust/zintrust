import EmailJobService, { testSamples } from '@app/Jobs/EmailJobService';
import { EmailQueue } from '@app/Workers/EmailWorker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the EmailWorker module so EmailQueue.add returns a predictable id
vi.mock('@app/Workers/EmailWorker', () => {
  return {
    EmailQueue: {
      add: vi.fn(async () => 'mock-job-id-123'),
    },
  };
});

describe('EmailJobService - basic behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('exports testSamples with expected keys', () => {
    expect(testSamples).toBeDefined();
    expect(testSamples.advancedQueuePatternsHeadline).toContain('Advanced Queue Patterns');
    expect(testSamples.uniqueIdExample).toContain('Queue.enqueue');
  });

  it('sendGeneral enqueues a job and returns job id', async () => {
    const jobId = await EmailJobService.sendGeneral('test@example.com', 'Hello', 'This is a test');
    expect(jobId).toBe('mock-job-id-123');
    expect((EmailQueue.add as any).mock.calls).toBeDefined();
  });
});
