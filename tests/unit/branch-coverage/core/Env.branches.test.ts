import {
  Env,
  buildRedisUrl,
  dirnameFromExecPath,
  resolveAppTimezone,
} from '@config/env';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalExecPath = process.execPath;
const originalPlatform = process.platform;
const originalEnv = process.env;

describe('Env uncovered branches', () => {
  afterEach(() => {
    vi.resetModules();
    Env.setSource(null);
    process.execPath = originalExecPath;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  it('normalizes packed scalar values of every scalar type', async () => {
    Env.setSource({
      USE_PACK: 'true',
      PACK_KEYS: ' PACK_A ',
      PACK_A: JSON.stringify({
        text: 'hello',
        count: 42,
        flag: true,
      }),
    });

    expect(Env.get('text')).toBe('hello');
    expect(Env.get('count')).toBe('42');
    expect(Env.get('flag')).toBe('true');
  });

  it('normalizes direct scalar values including null and undefined', () => {
    Env.setSource({ A: null, B: undefined, C: 12, D: false, E: 3n, F: { nested: true } });

    expect(Env.get('A', 'fallback')).toBe('fallback');
    expect(Env.get('B', 'fallback')).toBe('fallback');
    expect(Env.get('C')).toBe('12');
    expect(Env.get('D')).toBe('false');
    expect(Env.get('E')).toBe('3');
    expect(Env.has('F')).toBe(false);
  });

  it('throws a packed env error with details when JSON parsing fails', () => {
    Env.setSource({ USE_PACK: 'TRUE', PACK_KEYS: 'BAD', BAD: '{not json' });

    let caught: unknown;
    try {
      Env.getResolvedState();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string; statusCode?: number; details?: unknown };
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.details).toBeInstanceOf(Error);
  });

  it('throws when USE_PACK is true but PACK_KEYS is empty', () => {
    Env.setSource({ USE_PACK: 'true', PACK_KEYS: ' , , ' });

    expect(() => Env.getResolvedState()).toThrow(/PACK_KEYS is empty/i);
  });

  it('throws when a pack payload is missing or not a JSON object', () => {
    Env.setSource({ USE_PACK: 'true', PACK_KEYS: 'MISSING' });
    expect(() => Env.getResolvedState()).toThrow(/env.MISSING is missing/i);

    Env.setSource({ USE_PACK: 'true', PACK_KEYS: 'ARR', ARR: '[1,2]' });
    expect(() => Env.getResolvedState()).toThrow(/did not parse as a JSON object/i);
  });

  it('skips empty and reserved packed keys', () => {
    Env.setSource({
      USE_PACK: 'true',
      PACK_KEYS: 'PACK_B',
      PACK_B: JSON.stringify({
        '   ': 'ignored',
        USE_PACK: 'ignored',
        PACK_KEYS: 'ignored',
        ok: 'value',
      }),
    });

    const state = Env.getResolvedState();
    expect(state.values['ok']).toBe('value');
    expect(state.values['USE_PACK']).toBe('true');
    expect(state.values['']).toBeUndefined();
  });

  it('rejects nested, array, null and undefined packed values', () => {
    for (const bad of [{ nested: { a: 1 } }, { list: [1] }, { nil: null }]) {
      Env.setSource({
        USE_PACK: 'true',
        PACK_KEYS: 'PACK_BAD',
        PACK_BAD: JSON.stringify(bad),
      });
      expect(() => Env.getResolvedState()).toThrow(/Nested or null values are not supported/i);
    }
  });

  it('rejects packed payloads with unsupported scalar values', () => {
    Env.setSource({
      USE_PACK: 'true',
      PACK_KEYS: 'PACK_C',
      PACK_C: JSON.stringify({ bad: { nested: true } }),
    });
    expect(() => Env.getResolvedState()).toThrow(/Nested or null values are not supported/i);
  });

  it('exposes source metadata and undefined source lookups', () => {
    Env.setSource({ PACKED_KEY: 'packed-value', DIRECT_KEY: 'direct-value' });

    expect(Env.getSourceOf('PACKED_KEY')).toBe('direct-env');
    expect(Env.getSourceOf('MISSING_KEY')).toBeUndefined();
    expect(Env.snapshotSources()['DIRECT_KEY']).toBe('direct-env');
  });

  it('handles empty values for numeric and boolean getters', () => {
    Env.setSource({ EMPTY: '', SPACES: '   ' });

    expect(Env.getInt('EMPTY', 7)).toBe(7);
    expect(Env.getInt('SPACES', 9)).toBe(9);
    expect(Env.getFloat('EMPTY', 1.5)).toBe(1.5);
    expect(Env.getFloat('SPACES', 2.5)).toBe(2.5);
    expect(Env.getBool('EMPTY', true)).toBe(true);
    expect(Env.getBool('SPACES', false)).toBe(false);
  });

  it('derives directory names and resolves app timezone fallbacks', () => {
    expect(dirnameFromExecPath(String.raw`C:\Program Files\node.exe`, 'win32')).toBe(
      String.raw`C:\Program Files`
    );
    expect(dirnameFromExecPath('node')).toBe('');

    Env.setSource({ APP_TIMEZONE: 'Not/A_Timezone' });
    expect(resolveAppTimezone()).toBe('UTC');

    Env.setSource({ TIME_ZONE: 'UTC' });
    expect(resolveAppTimezone()).toBe('UTC');
  });

  it('builds redis urls with password and database variants', () => {
    Env.setSource({ REDIS_URL: ' redis://custom:6379 ' });
    expect(buildRedisUrl()).toBe('redis://custom:6379');

    Env.setSource({
      REDIS_HOST: 'cache.local',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'p@ss word',
      REDIS_QUEUE_DB: '3',
    });
    expect(buildRedisUrl()).toBe('redis://:p%40ss%20word@cache.local:6380/3');

    Env.setSource({});
    expect(buildRedisUrl()).toBe('redis://localhost:6379');
  });

  it('returns early from set/unset when process.env is unavailable', async () => {
    const saved = Object.getOwnPropertyDescriptor(process, 'env');
    Object.defineProperty(process, 'env', { value: undefined, configurable: true });
    try {
      const mod = await import('@config/env');
      expect(() => mod.Env.set('X', 'Y')).not.toThrow();
      expect(() => mod.Env.unset('X')).not.toThrow();
    } finally {
      if (saved) Object.defineProperty(process, 'env', saved);
    }
  });

  it('computes path fallbacks when process.execPath is missing and on win32', async () => {
    const saved = Object.getOwnPropertyDescriptor(process, 'execPath');
    Object.defineProperty(process, 'execPath', { value: undefined, configurable: true });
    vi.resetModules();
    const noExecPath = await import('@config/env');
    expect(noExecPath.Env.NODE_BIN_DIR).toBe('');
    expect(noExecPath.Env.SAFE_PATH).toBe('');

    Object.defineProperty(process, 'execPath', {
      value: String.raw`C:\Program Files\node.exe`,
      configurable: true,
    });
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.resetModules();
    const win = await import('@config/env');
    expect(win.Env.SAFE_PATH).toContain(String.raw`C:\Windows\System32`);

    if (saved) Object.defineProperty(process, 'execPath', saved);
  });
});
