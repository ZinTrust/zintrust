import { Env } from '@config/env';
import { existsSync, readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

// NOTE: This module intentionally updates runtime environment values
// via Env.set() to populate process.env during CLI initialization.
// This is the only location where such mutations should occur.

type node_env = 'development' | 'production' | 'testing';
type EnvMap = Record<string, string>;

const safeEnvGet = (key: string, defaultValue = ''): string => {
  const envAny = Env as unknown as { get?: (k: string, d?: string) => string };
  if (typeof envAny.get === 'function') return envAny.get(key, defaultValue);

  const fromProcess = typeof process === 'undefined' ? undefined : process.env?.[key];
  if (typeof fromProcess === 'string' && fromProcess !== '') return fromProcess;
  return defaultValue;
};

const safeEnvSet = (key: string, value: string): void => {
  const envAny = Env as unknown as { set?: (k: string, v: string) => void };
  if (typeof envAny.set === 'function') {
    envAny.set(key, value);
    return;
  }

  if (typeof process === 'undefined' || process.env === undefined) return;
  process.env[key] = value;
};

const normalizeAppMode = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'production' || normalized === 'pro' || normalized === 'prod')
    return 'production';
  if (normalized === 'dev' || normalized === 'development') return 'development';

  // Per spec: any other value is treated as development.
  return 'development';
};

const stripInlineComment = (value: string): string => {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble && ch === '#') {
      const prev = value[i - 1];
      if (prev === undefined || prev === ' ' || prev === '\t') {
        return value.slice(0, i).trimEnd();
      }
    }
  }

  return value;
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
};

const parseEnvFile = (raw: string): EnvMap => {
  const result: EnvMap = {};
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length) : trimmed;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (key === '') continue;

    const rhs = withoutExport.slice(eq + 1);
    const withoutComment = stripInlineComment(rhs);
    const value = unquote(withoutComment);

    // DX: treat empty assignments as "no-op" if the key already had a non-empty value earlier
    // in the same file. This prevents accidental overrides like:
    //   KV_NAMESPACE_ID=abc
    //   ...
    //   KV_NAMESPACE_ID=
    if (value.trim() === '' && (result[key]?.trim() ?? '') !== '') continue;

    result[key] = value;
  }

  return result;
};

const applyToProcessEnv = (values: EnvMap, overrideExisting: boolean): void => {
  for (const [key, value] of Object.entries(values)) {
    if (!overrideExisting && safeEnvGet(key, '') !== '') continue;

    // DX: don't wipe an already-populated env var with an empty value from an env file.
    // This avoids surprising behavior when env templates include duplicate keys with blanks.
    if (value.trim() === '' && safeEnvGet(key, '').trim() !== '') continue;
    safeEnvSet(key, value);
  }

  // Compatibility helpers
  if (safeEnvGet('PORT', '') === '' && safeEnvGet('APP_PORT', '') !== '') {
    safeEnvSet('PORT', safeEnvGet('APP_PORT', ''));
  }
};

const readEnvFileIfExists = (cwd: string, filename: string): EnvMap | undefined => {
  const fullPath = join(cwd, filename);
  if (!existsSync(fullPath)) return undefined;
  const raw = readFileSync(fullPath, 'utf-8');
  return parseEnvFile(raw);
};

const resolveAppMode = (cwd: string): string | undefined => {
  const existing = safeEnvGet('NODE_ENV', '');
  if (existing.trim() !== '') return normalizeAppMode(existing);

  const fromDotEnv = readEnvFileIfExists(cwd, '.env');
  const value = fromDotEnv?.['NODE_ENV'];
  if (typeof value === 'string' && value.trim() !== '') return normalizeAppMode(value);

  return undefined;
};

type LoadOptions = {
  cwd?: string;
  overrideExisting?: boolean;
};

type LoadState = {
  loadedFiles: string[];
  mode?: string;
};

type CliOverrides = {
  nodeEnv?: node_env;
  port?: number;
  runtime?: string;
  cacheEnabled?: boolean;
};

const filesLoader = (cwd: string, mode: string | undefined): string[] => {
  const files: string[] = [];
  if (existsSync(join(cwd, '.env'))) files.push('.env');

  // Per your rule: production uses .env; dev uses .env.dev
  if (mode !== undefined && mode !== '' && mode !== 'production') {
    const modeFile = `.env.${mode}`;
    if (existsSync(join(cwd, modeFile))) files.push(modeFile);
  }

  const local = '.env.local';
  if (existsSync(join(cwd, local))) files.push(local);

  if (mode !== undefined && mode !== '') {
    const modeLocal = `.env.${mode}.local`;
    if (existsSync(join(cwd, modeLocal))) files.push(modeLocal);
  }

  return files;
};

let cached: LoadState | undefined;

const load = (options: LoadOptions = {}): LoadState => {
  if (cached !== undefined) return cached;

  const cwd = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : process.cwd();
  const overrideExisting = options.overrideExisting ?? true;

  const mode = resolveAppMode(cwd);

  const files = filesLoader(cwd, mode);

  let baseApplied = false;

  for (const file of files) {
    const parsed = readEnvFileIfExists(cwd, file);
    if (!parsed) continue;

    if (file === '.env') {
      applyToProcessEnv(parsed, overrideExisting);
      baseApplied = true;
      continue;
    }

    // .env is primary: overlays only fill missing values and never override base.
    applyToProcessEnv(parsed, baseApplied ? false : overrideExisting);
  }

  // Set NODE_ENV to the normalized mode if we have one (after applying files)
  if (mode !== undefined) {
    safeEnvSet('NODE_ENV', mode as node_env);
  }

  cached = { loadedFiles: files, mode };
  return cached;
};

const ensureLoaded = (): LoadState => load({ overrideExisting: true });

const applyCliOverrides = (overrides: CliOverrides): void => {
  // Ensure base env is loaded first.
  ensureLoaded();

  if (typeof overrides.runtime === 'string' && overrides.runtime.trim() !== '') {
    safeEnvSet('RUNTIME', overrides.runtime.trim());
  }

  if (typeof overrides.nodeEnv === 'string') {
    safeEnvSet('NODE_ENV', overrides.nodeEnv);
  }

  if (typeof overrides.port === 'number') {
    safeEnvSet('PORT', String(overrides.port));
    safeEnvSet('APP_PORT', String(overrides.port));
  }

  if (typeof overrides.cacheEnabled === 'boolean') {
    safeEnvSet('CACHE_ENABLED', String(overrides.cacheEnabled));
  }

  // Keep PORT/APP_PORT in sync if only one exists.
  if (safeEnvGet('PORT', '') === '' && safeEnvGet('APP_PORT', '') !== '') {
    safeEnvSet('PORT', safeEnvGet('APP_PORT', ''));
  }

  if (safeEnvGet('APP_PORT', '') === '' && safeEnvGet('PORT', '') !== '') {
    safeEnvSet('APP_PORT', safeEnvGet('PORT', ''));
  }
};

const getState = (): LoadState => ensureLoaded();

export const EnvFileLoader = Object.freeze({
  load,
  ensureLoaded,
  applyCliOverrides,
  getState,
});
