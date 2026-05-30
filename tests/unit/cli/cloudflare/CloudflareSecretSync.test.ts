import { describe, expect, it, vi } from 'vitest';

describe('CloudflareSecretSync resolveValue', () => {
  it('returns empty string when custom env file is provided and key is not found', async () => {
    // Mock the module to test the resolveValue function
    const { resolveValue } = await import('@/cli/cloudflare/CloudflareSecretSync');

    // Test the uncovered line: return fromFile ?? '' when custom env file is used
    const envMap: Record<string, string> = {};
    const customEnvPath = '.env.custom';
    const all = false;

    const result = resolveValue('MISSING_KEY', envMap, customEnvPath, all);
    expect(result).toBe('');
  });

  it('returns value from custom env file when key exists', async () => {
    const { resolveValue } = await import('@/cli/cloudflare/CloudflareSecretSync');

    const envMap: Record<string, string> = { API_KEY: 'secret123' };
    const customEnvPath = '.env.custom';
    const all = false;

    const result = resolveValue('API_KEY', envMap, customEnvPath, all);
    expect(result).toBe('secret123');
  });

  it('falls back to process.env when using default .env file', async () => {
    const { resolveValue } = await import('@/cli/cloudflare/CloudflareSecretSync');

    const envMap: Record<string, string> = {};
    const defaultEnvPath = '.env';
    const all = false;

    const result = resolveValue('PATH', envMap, defaultEnvPath, all);
    expect(result).toBe(process.env['PATH'] ?? '');
  });

  it('uses process.env fallback when all flag is true', async () => {
    const { resolveValue } = await import('@/cli/cloudflare/CloudflareSecretSync');

    const envMap: Record<string, string> = {};
    const customEnvPath = '.env.custom';
    const all = true;

    const result = resolveValue('PATH', envMap, customEnvPath, all);
    expect(result).toBe(process.env['PATH'] ?? '');
  });
});
