import { Env } from '@zintrust/core/config';

export type RetentionSetting = number | boolean | { age: number; count?: number };

/**
 * Resolves a BullMQ retention setting from env.
 *
 * Resolution order:
 *  1. If <key>_AGE_SECONDS is set and <key> is also set → { age, count }
 *  2. If <key>_AGE_SECONDS is set alone              → { age }
 *  3. If <key> is set alone                          → integer count
 *  4. Otherwise                                      → fallbackCount
 */
export const resolveRetentionSetting = (key: string, fallbackCount: number): RetentionSetting => {
  const ageSeconds = Env.getInt(`${key}_AGE_SECONDS`, 0);
  const countRaw = Env.get(key, '').trim();

  if (ageSeconds > 0) {
    if (countRaw.length > 0) {
      return { age: ageSeconds, count: Env.getInt(key, fallbackCount) };
    }
    return { age: ageSeconds };
  }

  return countRaw.length > 0 ? Env.getInt(key, fallbackCount) : fallbackCount;
};
