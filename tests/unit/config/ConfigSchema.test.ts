import { getConfigValue, getDefaultValue, setConfigValue } from '@cli/config/ConfigSchema';
import { describe, expect, test } from 'vitest';

describe('ConfigSchema helpers', () => {
  test('getDefaultValue returns nested defaults and undefined for missing', () => {
    expect(getDefaultValue('name')).toBe('zintrust-app');
    expect(getDefaultValue('server.port')).toBe(7777);
    expect(getDefaultValue('features.database')).toBe(true);
    expect(getDefaultValue('non.existing.path')).toBeUndefined();
  });

  test('setConfigValue and getConfigValue deep set/get', () => {
    const obj: Record<string, unknown> = {};
    setConfigValue(obj, 'server.port', 8080);
    expect(getConfigValue(obj, 'server.port')).toBe(8080);

    setConfigValue(obj, 'database.connection', 'postgres');
    expect(getConfigValue(obj, 'database.connection')).toBe('postgres');

    // Overwrite existing
    setConfigValue(obj, 'server.port', 9000);
    expect(getConfigValue(obj, 'server.port')).toBe(9000);

    // Non existent path returns undefined
    expect(getConfigValue(obj, 'server.missing')).toBeUndefined();
  });
});
