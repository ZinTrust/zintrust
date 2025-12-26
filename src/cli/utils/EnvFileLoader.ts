import { existsSync, readFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

type EnvMap = Record<string, string>;

const normalizeAppMode = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'production' || normalized === 'pro' || normalized === 'prod')
    return 'production';
  if (normalized === 'dev' || normalized === 'development') return 'dev';

  // Per spec: any other value is treated as development.
  return 'dev';
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

    result[key] = value;
  }

  return result;
};

const applyToProcessEnv = (values: EnvMap, overrideExisting: boolean): void => {
  for (const [key, value] of Object.entries(values)) {
    if (!overrideExisting && typeof process.env[key] === 'string') continue;
    process.env[key] = value;
  }

  // Compatibility helpers
  if (typeof process.env['PORT'] !== 'string' && typeof process.env['APP_PORT'] === 'string') {
    process.env['PORT'] = process.env['APP_PORT'];
  }

  if (typeof process.env['NODE_ENV'] !== 'string' && typeof process.env['APP_MODE'] === 'string') {
    const mode = normalizeAppMode(process.env['APP_MODE']);
    process.env['NODE_ENV'] = mode === 'production' ? 'production' : 'development';
  }
};

const readEnvFileIfExists = (cwd: string, filename: string): EnvMap | undefined => {
  const fullPath = join(cwd, filename);
  if (!existsSync(fullPath)) return undefined;
  const raw = readFileSync(fullPath, 'utf-8');
  return parseEnvFile(raw);
};

const resolveAppMode = (cwd: string): string | undefined => {
  const existing = process.env['APP_MODE'];
  if (typeof existing === 'string' && existing.trim() !== '') return normalizeAppMode(existing);

  const fromDotEnv = readEnvFileIfExists(cwd, '.env');
  const value = fromDotEnv?.['APP_MODE'];
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
  nodeEnv?: 'development' | 'production' | 'testing';
  port?: number;
  runtime?: string;
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

  cached = { loadedFiles: files, mode };
  return cached;
};

const ensureLoaded = (): LoadState => load({ overrideExisting: true });

const applyCliOverrides = (overrides: CliOverrides): void => {
  // Ensure base env is loaded first.
  ensureLoaded();

  if (typeof overrides.runtime === 'string' && overrides.runtime.trim() !== '') {
    process.env['RUNTIME'] = overrides.runtime.trim();
  }

  if (typeof overrides.nodeEnv === 'string') {
    process.env['NODE_ENV'] = overrides.nodeEnv;
  }

  if (typeof overrides.port === 'number') {
    process.env['PORT'] = String(overrides.port);
    process.env['APP_PORT'] = String(overrides.port);
  }

  // Keep PORT/APP_PORT in sync if only one exists.
  if (typeof process.env['PORT'] !== 'string' && typeof process.env['APP_PORT'] === 'string') {
    process.env['PORT'] = process.env['APP_PORT'];
  }

  if (typeof process.env['APP_PORT'] !== 'string' && typeof process.env['PORT'] === 'string') {
    process.env['APP_PORT'] = process.env['PORT'];
  }
};

const getState = (): LoadState => ensureLoaded();

export const EnvFileLoader = Object.freeze({
  load,
  ensureLoaded,
  applyCliOverrides,
  getState,
});
