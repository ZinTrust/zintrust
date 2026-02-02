/**
 * Cloudflare Workers Environment Access
 *
 * Centralizes access to Workers bindings via globalThis.env.
 * This keeps runtime-specific globals out of adapters/drivers.
 */

import type { KVNamespace, WorkersEnv } from '@config/type';
import type { DatabaseConfig, ID1Database } from '@orm/DatabaseAdapter';

const getWorkersEnv = (): WorkersEnv | null => {
  const env = (globalThis as unknown as { env?: unknown }).env;
  if (env === undefined || env === null) return null;
  if (typeof env !== 'object') return null;
  return env as WorkersEnv;
};

const getD1Binding = (config: DatabaseConfig): ID1Database | null => {
  if (config.d1 !== undefined && config.d1 !== null) return config.d1;

  const env = getWorkersEnv();
  const envDb = env === null ? undefined : (env['DB'] as ID1Database | undefined);
  if (envDb !== undefined) return envDb;

  const globalDb = (globalThis as unknown as { DB?: ID1Database }).DB;
  if (globalDb !== undefined) return globalDb;

  return null;
};

const getKVBinding = (bindingName = 'CACHE'): KVNamespace | null => {
  const env = getWorkersEnv();
  if (env === null) return null;

  const kv = env[bindingName] as KVNamespace | undefined;
  return kv ?? null;
};

const getR2Binding = (bindingName?: string): unknown => {
  const env = getWorkersEnv();
  if (env === null) return null;

  if (typeof bindingName === 'string' && bindingName.trim() !== '') {
    return env[bindingName] ?? null;
  }

  const defaultNames = ['R2_BUCKET', 'R2', 'BUCKET'];
  for (const name of defaultNames) {
    const binding = env[name];
    if (binding !== undefined && binding !== null) return binding;
  }

  return null;
};

const getWorkersVar = (key: string): string | null => {
  const env = getWorkersEnv();
  if (env === null) return null;
  const value = env[key];
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  return String(value);
};

type AssetsBinding = {
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
};

const getAssetsBinding = (): AssetsBinding | null => {
  const env = getWorkersEnv();
  if (env === null) return null;
  const binding = env['ASSETS'] as AssetsBinding | undefined;
  if (binding && typeof binding.fetch === 'function') return binding;
  return null;
};

const isCloudflareSocketsEnabled = (): boolean => {
  const raw = getWorkersVar('ENABLE_CLOUDFLARE_SOCKETS');
  if (raw === null) return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return false;
  return normalized === 'true' || normalized === '1';
};

export const Cloudflare = Object.freeze({
  getWorkersEnv,
  getD1Binding,
  getKVBinding,
  getR2Binding,
  getAssetsBinding,
  getWorkersVar,
  isCloudflareSocketsEnabled,
});
