import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Env } from '@zintrust/core/config';
import { resolveRetentionSetting } from '../../../../packages/queue-redis/src/retentionUtils';

const KEY = 'BULLMQ_REMOVE_ON_FAIL';
const COMPLETE_KEY = 'BULLMQ_REMOVE_ON_COMPLETE';

describe('resolveRetentionSetting', () => {
  beforeEach(() => {
    Env.setSource({});
  });

  afterEach(() => {
    Env.setSource(null);
  });

  it('returns fallback count when neither env var is set', () => {
    expect(resolveRetentionSetting(KEY, 50)).toBe(50);
    expect(resolveRetentionSetting(COMPLETE_KEY, 100)).toBe(100);
  });

  it('returns integer count when only the base key is set', () => {
    Env.setSource({ [KEY]: '200' });
    expect(resolveRetentionSetting(KEY, 50)).toBe(200);
  });

  it('returns age-only object when only the _AGE_SECONDS key is set', () => {
    Env.setSource({ [`${KEY}_AGE_SECONDS`]: '604800' });
    expect(resolveRetentionSetting(KEY, 50)).toEqual({ age: 604800 });
  });

  it('returns combined age+count object when both keys are set', () => {
    Env.setSource({ [`${KEY}_AGE_SECONDS`]: '604800', [KEY]: '500' });
    expect(resolveRetentionSetting(KEY, 50)).toEqual({ age: 604800, count: 500 });
  });

  it('completed and failed retention are resolved independently', () => {
    Env.setSource({
      [`${COMPLETE_KEY}_AGE_SECONDS`]: '86400',
      [KEY]: '75',
    });

    expect(resolveRetentionSetting(COMPLETE_KEY, 100)).toEqual({ age: 86400 });
    expect(resolveRetentionSetting(KEY, 50)).toBe(75);
  });

  it('ignores _AGE_SECONDS when set to 0 and falls through to count', () => {
    Env.setSource({ [`${KEY}_AGE_SECONDS`]: '0', [KEY]: '30' });
    expect(resolveRetentionSetting(KEY, 50)).toBe(30);
  });

  it('uses fallback count when _AGE_SECONDS is 0 and base key is unset', () => {
    Env.setSource({ [`${KEY}_AGE_SECONDS`]: '0' });
    expect(resolveRetentionSetting(KEY, 50)).toBe(50);
  });
});
