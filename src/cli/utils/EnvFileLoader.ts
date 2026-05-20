import { Env } from '@config/env';
import { isArray, isNonEmptyString } from '@helper/index';
import { existsSync, readFileSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

// NOTE: This module intentionally updates runtime environment values
// via Env.set() to populate process.env during CLI initialization.
// This is the only location where such mutations should occur.

type node_env = 'development' | 'production' | 'testing';
type EnvMap = Record<string, string>;
const PACK_CONTROL_KEYS = new Set(['USE_PACK', 'PACK_KEYS']);

const safeEnvGet = (key: string, defaultValue = ''): string => {
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
  const fullPath = path.join(cwd, filename);
  if (!existsSync(fullPath)) return undefined;
  const raw = readFileSync(fullPath, 'utf-8');
  return parseEnvFile(raw);
};

const readPackEnvFileIfExists = (cwd: string): EnvMap | undefined => {
  const parsed = readEnvFileIfExists(cwd, '.env.pack');
  if (parsed === undefined) return undefined;

  const filtered: EnvMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (PACK_CONTROL_KEYS.has(key)) continue;
    filtered[key] = value;
  }

  return filtered;
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
  includeCwd?: boolean;
  extraCwds?: string[];
  envPaths?: string[];
  envPathsOverrideExisting?: boolean;
  overrideExisting?: boolean;
};

type LoadState = {
  loadedFiles: string[];
  mode?: string;
};

type CachedLoadState = LoadState & {
  loadedSourceKeys: string[];
};

type LoadSource = {
  key: string;
  path: string;
  kind: 'cwd' | 'file';
  overrideExisting: boolean;
};

type CliOverrides = {
  nodeEnv?: node_env;
  port?: number;
  runtime?: string;
  cacheEnabled?: boolean;
};

const filesLoader = (cwd: string, mode: string | undefined): string[] => {
  const files: string[] = [];
  if (existsSync(path.join(cwd, '.env'))) files.push('.env');

  // Per your rule: production uses .env; dev uses .env.dev
  if (mode !== undefined && mode !== '' && mode !== 'production') {
    const modeFile = `.env.${mode}`;
    if (existsSync(path.join(cwd, modeFile))) files.push(modeFile);
  }

  const local = '.env.local';
  if (existsSync(path.join(cwd, local))) files.push(local);

  if (mode !== undefined && mode !== '') {
    const modeLocal = `.env.${mode}.local`;
    if (existsSync(path.join(cwd, modeLocal))) files.push(modeLocal);
  }

  return files;
};

let cached: CachedLoadState | undefined;

const loadFromCwd = (cwd: string, overrideExisting: boolean): LoadState => {
  const mode = resolveAppMode(cwd);
  const files = filesLoader(cwd, mode);
  const loadedFiles: string[] = [];

  let baseApplied = false;

  for (const file of files) {
    const parsed = readEnvFileIfExists(cwd, file);
    if (!parsed) continue;
    loadedFiles.push(file);

    if (file === '.env') {
      applyToProcessEnv(parsed, overrideExisting);
      baseApplied = true;
      continue;
    }

    // .env is primary: overlays only fill missing values and never override base.
    applyToProcessEnv(parsed, baseApplied ? false : overrideExisting);
  }

  const packedEnv = readPackEnvFileIfExists(cwd);
  if (packedEnv !== undefined) {
    applyToProcessEnv(packedEnv, false);
    loadedFiles.push('.env.pack');
  }

  // Set NODE_ENV to the normalized mode if we have one (after applying files)
  if (mode !== undefined) {
    safeEnvSet('NODE_ENV', mode);
  }

  return { loadedFiles, mode };
};

const loadFromFile = (filePath: string, overrideExisting: boolean): LoadState => {
  if (!existsSync(filePath)) return { loadedFiles: [] };

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parseEnvFile(raw);
  applyToProcessEnv(parsed, overrideExisting);

  const rawMode = parsed['NODE_ENV'];
  const mode = isNonEmptyString(rawMode) ? normalizeAppMode(rawMode) : undefined;
  if (mode !== undefined) {
    safeEnvSet('NODE_ENV', mode);
  }

  return { loadedFiles: [filePath], mode };
};

const normalizeCwdList = (value: unknown): string[] => {
  if (!isArray(value)) return [];

  return value
    .filter(isNonEmptyString)
    .map((item) => item.trim())
    .filter((item) => item !== '');
};

const normalizeEnvPathList = (value: unknown): string[] => normalizeCwdList(value);

const createLoadPlan = (options: LoadOptions): LoadSource[] => {
  const cwd = isNonEmptyString(options.cwd) ? options.cwd : process.cwd();
  const includeCwd = options.includeCwd !== false;
  const extraCwds = normalizeCwdList(options.extraCwds);
  const envPaths = normalizeEnvPathList(options.envPaths);
  const overrideExisting = options.overrideExisting ?? true;
  const envPathsOverrideExisting = options.envPathsOverrideExisting ?? true;

  const sources: LoadSource[] = [];
  if (includeCwd) {
    sources.push({
      key: `cwd:${cwd}`,
      path: cwd,
      kind: 'cwd',
      overrideExisting,
    });
  }

  for (const extraCwd of extraCwds) {
    sources.push({
      key: `cwd:${extraCwd}`,
      path: extraCwd,
      kind: 'cwd',
      overrideExisting: true,
    });
  }

  for (const envPath of envPaths) {
    const looksLikeFile = path.basename(envPath).startsWith('.env');
    sources.push({
      key: `${looksLikeFile ? 'file' : 'cwd'}:${envPath}`,
      path: envPath,
      kind: looksLikeFile ? 'file' : 'cwd',
      overrideExisting: envPathsOverrideExisting,
    });
  }

  return sources.filter(
    (source, index, items) => items.findIndex((item) => item.key === source.key) === index
  );
};

const loadSource = (source: LoadSource): LoadState => {
  if (source.kind === 'file') return loadFromFile(source.path, source.overrideExisting);
  return loadFromCwd(source.path, source.overrideExisting);
};

const mergeCachedState = (
  state: CachedLoadState,
  source: LoadSource,
  next: LoadState
): CachedLoadState => {
  state.loadedSourceKeys.push(source.key);
  if (next.mode !== undefined && state.mode === undefined) {
    state.mode = next.mode;
  }

  if (next.loadedFiles.length > 0) {
    state.loadedFiles.push(...next.loadedFiles);
  }

  return state;
};

const load = (options: LoadOptions = {}): LoadState => {
  const plan = createLoadPlan(options);

  cached ??= { loadedFiles: [], loadedSourceKeys: [] };

  for (const source of plan) {
    if (cached.loadedSourceKeys.includes(source.key)) continue;
    mergeCachedState(cached, source, loadSource(source));
  }

  return cached;
};

const resetCache = (): void => {
  cached = undefined;
};

const ensureLoaded = (options: Omit<LoadOptions, 'overrideExisting'> = {}): LoadState =>
  load({ ...options, overrideExisting: false });

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
  resetCache,
});
