import AdvancedEmailJobService, { testSamples } from '@app/Jobs/AdvancedEmailJobService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the AdvancEmailWorker module
vi.mock('@app/Workers/AdvancEmailWorker', () => ({
  AdvancEmailQueue: {
    add: vi.fn(async () => `advanced-job-id-${Date.now()}`),
    processOne: vi.fn(async () => true),
    processAll: vi.fn(async () => 5),
    start: vi.fn(async () => {}),
  },
}));

describe('AdvancedEmailJobService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('exports testSamples with expected keys', () => {
    expect(testSamples).toBeDefined();
    expect(testSamples.advancedQueuePatternsHeadline).toContain('Advanced Queue Patterns');
    expect(testSamples.uniqueIdExample).toContain('sendWithDeduplication');
  });

  it('sendWithDeduplication queues job with deduplication', async () => {
    const jobId = await AdvancedEmailJobService.sendWithDeduplication(
      'test@example.com',
      'Test Subject',
      'test-template',
      { name: 'Test User' },
      'unique-dedup-id'
    );

    expect(jobId).toMatch(/^advanced-job-id-\d+$/);
    // The mock should have been called with the correct payload structure
  });

  it('sendWithUniqueLock queues job with unique lock', async () => {
    const jobId = await AdvancedEmailJobService.sendWithUniqueLock(
      'test@example.com',
      'Test Subject',
      'test-template',
      { name: 'Test User' },
      'unique-via-key'
    );

    expect(jobId).toMatch(/^advanced-job-id-\d+$/);
  });

  it('sendBulk queues multiple jobs in parallel', async () => {
    const recipients = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
    const jobIds = await AdvancedEmailJobService.sendBulk(
      recipients,
      'Bulk Test',
      'bulk-template',
      { campaign: 'test-campaign' }
    );

    expect(jobIds).toHaveLength(3);
    jobIds.forEach((jobId) => {
      expect(jobId).toMatch(/^advanced-job-id-\d+$/);
    });
  });

  it('sendHighPriority queues job with priority options', async () => {
    const jobId = await AdvancedEmailJobService.sendHighPriority(
      'test@example.com',
      'High Priority Test',
      'priority-template',
      { urgent: true },
      { priority: 20, delay: 1000 }
    );

    expect(jobId).toMatch(/^advanced-job-id-\d+$/);
  });

  it('sendWithMetadata queues job with custom metadata', async () => {
    const jobId = await AdvancedEmailJobService.sendWithMetadata(
      'test@example.com',
      'Metadata Test',
      'metadata-template',
      { content: 'test' },
      {
        campaign: 'summer-2024',
        source: 'web-app',
        priority: 'high',
        tags: ['marketing', 'promotion'],
      }
    );

    expect(jobId).toMatch(/^advanced-job-id-\d+$/);
  });

  it('sendScheduled queues job with delay', async () => {
    const jobId = await AdvancedEmailJobService.sendScheduled(
      'test@example.com',
      'Scheduled Test',
      'scheduled-template',
      { event: 'meeting' },
      3600000 // 1 hour delay
    );

    expect(jobId).toMatch(/^advanced-job-id-\d+$/);
  });
});
