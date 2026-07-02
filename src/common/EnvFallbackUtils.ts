import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';

const normalizeEnvString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

export const readWorkersEnvString = (key: string): string => {
  const workerValue = Cloudflare.getWorkersVar(key);
  if (workerValue !== null && workerValue.trim() !== '') return workerValue;
  return '';
};

export const readWorkersFallbackString = (
  workersKey: string,
  fallbackKey: string,
  fallback = '',
  includeFallbackWorkerBinding = false
): string => {
  const workerValue = readWorkersEnvString(workersKey);
  if (workerValue.trim() !== '') return workerValue;

  if (includeFallbackWorkerBinding) {
    const fallbackWorkerValue = readWorkersEnvString(fallbackKey);
    if (fallbackWorkerValue.trim() !== '') return fallbackWorkerValue;
  }

  return normalizeEnvString(Env.get(fallbackKey, fallback), fallback);
};

export const readWorkersFallbackInt = (
  workersKey: string,
  fallbackKey: string,
  fallback: number,
  includeFallbackWorkerBinding = false
): number => {
  const raw = readWorkersFallbackString(
    workersKey,
    fallbackKey,
    String(fallback),
    includeFallbackWorkerBinding
  );
  if (raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const readWorkersFallbackBool = (
  workersKey: string,
  fallbackKey: string,
  fallback: boolean
): boolean => {
  const workerValue = readWorkersEnvString(workersKey);
  if (workerValue.trim() !== '') {
    return workerValue === 'true' || workerValue === '1';
  }
  return Env.getBool(fallbackKey, fallback);
};

export const parseJsonObjectEnv = (key: string): Record<string, unknown> | undefined => {
  const value = Env.get(key, '');
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { value: raw };
  }
  return undefined;
};
