import { describe, expect, it } from 'vitest';
import FeatureFlags from '@/config/features';

describe('FeatureFlags setWorkerDetailsLiveHealthEnabled', () => {
  it('should set worker details live health enabled', () => {
    FeatureFlags.setWorkerDetailsLiveHealthEnabled(true);
    expect(() => FeatureFlags.setWorkerDetailsLiveHealthEnabled(false)).not.toThrow();
  });
});
