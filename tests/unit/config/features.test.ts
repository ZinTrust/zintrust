import { FeatureFlags } from '@config/features';
import { describe, expect, it } from 'vitest';

describe('FeatureFlags', () => {
  it('initialize should disable raw queries by default', () => {
    delete process.env.USE_RAW_QRY;
    FeatureFlags.reset();

    FeatureFlags.initialize();

    expect(FeatureFlags.isRawQueryEnabled()).toBe(false);
  });

  it('initialize should enable raw queries when USE_RAW_QRY=true', () => {
    process.env.USE_RAW_QRY = 'true';
    FeatureFlags.reset();

    FeatureFlags.initialize();

    expect(FeatureFlags.isRawQueryEnabled()).toBe(true);
  });

  it('setRawQueryEnabled should override state', () => {
    FeatureFlags.reset();
    FeatureFlags.setRawQueryEnabled(true);
    expect(FeatureFlags.isRawQueryEnabled()).toBe(true);

    FeatureFlags.setRawQueryEnabled(false);
    expect(FeatureFlags.isRawQueryEnabled()).toBe(false);
  });
});
