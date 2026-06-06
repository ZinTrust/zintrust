import { describe, expect, it } from 'vitest';
import { jobTrackingCleanup } from '@app/Schedules';

describe('app/Schedules/index', () => {
  it('should export jobTrackingCleanup', () => {
    expect(jobTrackingCleanup).toBeDefined();
  });
});
