import { isNonEmptyString } from '@helper/index';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export type WranglerD1DatabaseConfig = {
  binding?: string;
  database_name?: string;
  database_id?: string;
  migrations_dir?: string;
};

type WranglerConfig = {
  d1_databases?: WranglerD1DatabaseConfig[];
};

type StripState = {
  inString: boolean;
  escaped: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
  skipNext: boolean;
};

type StringScanState = {
  inString: boolean;
  escaped: boolean;
};

const createStripState = (): StripState => ({
  inString: false,
  escaped: false,
  inLineComment: false,
  inBlockComment: false,
  skipNext: false,
});

const consumeSkipNext = (state: StripState): boolean => {
  if (!state.skipNext) return false;
  state.skipNext = false;
  return true;
};

const handleLineComment = (state: StripState, ch: string, out: string[]): boolean => {
  if (!state.inLineComment) return false;
  if (ch === '\n') {
    state.inLineComment = false;
    out.push(ch);
  }
  return true;
};

const handleBlockComment = (state: StripState, ch: string, next: string): boolean => {
  if (!state.inBlockComment) return false;
  if (ch === '*' && next === '/') {
    state.inBlockComment = false;
    state.skipNext = true;
  }
  return true;
};

const handleString = (state: StringScanState, ch: string, out: string[]): boolean => {
  if (!state.inString) return false;

  out.push(ch);
  if (state.escaped) {
    state.escaped = false;
    return true;
  }

  if (ch === '\\') {
    state.escaped = true;
    return true;
  }

  if (ch === '"') {
    state.inString = false;
  }

  return true;
};

const tryStartString = (state: StringScanState, ch: string, out: string[]): boolean => {
  if (ch !== '"') return false;
  state.inString = true;
  out.push(ch);
  return true;
};

const tryStartLineComment = (state: StripState, ch: string, next: string): boolean => {
  if (ch !== '/' || next !== '/') return false;
  state.inLineComment = true;
  state.skipNext = true;
  return true;
};

const tryStartBlockComment = (state: StripState, ch: string, next: string): boolean => {
  if (ch !== '/' || next !== '*') return false;
  state.inBlockComment = true;
  state.skipNext = true;
  return true;
};

const processStripChar = (state: StripState, ch: string, next: string, out: string[]): boolean => {
  if (consumeSkipNext(state)) return true;

  if (handleLineComment(state, ch, out)) return true;
  if (handleBlockComment(state, ch, next)) return true;
  if (handleString(state, ch, out)) return true;
  if (tryStartString(state, ch, out)) return true;
  if (tryStartLineComment(state, ch, next)) return true;
  if (tryStartBlockComment(state, ch, next)) return true;

  return false;
};

const stripJsonc = (input: string): string => {
  const state = createStripState();
  const out: string[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? '';
    const next = i + 1 < input.length ? (input[i + 1] ?? '') : '';

    if (processStripChar(state, ch, next, out)) continue;

    out.push(ch);
  }

  return out.join('');
};

type TrailingCommaState = {
  inString: boolean;
  escaped: boolean;
};

const createTrailingCommaState = (): TrailingCommaState => ({
  inString: false,
  escaped: false,
});

const isWhitespace = (ch: string): boolean =>
  ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';

const shouldDropTrailingComma = (input: string, fromIndex: number): boolean => {
  let j = fromIndex;

  while (j < input.length) {
    const next = input[j] ?? '';
    if (isWhitespace(next)) {
      j += 1;
      continue;
    }
    return next === '}' || next === ']';
  }

  return true;
};

const stripTrailingCommas = (input: string): string => {
  const state = createTrailingCommaState();
  const out: string[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? '';

    if (handleString(state, ch, out)) continue;
    if (tryStartString(state, ch, out)) continue;

    if (ch === ',' && shouldDropTrailingComma(input, i + 1)) continue;

    out.push(ch);
  }

  return out.join('');
};

const readWranglerConfig = (projectRoot: string): WranglerConfig | null => {
  const configPath = path.join(projectRoot, 'wrangler.jsonc');
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(stripTrailingCommas(stripJsonc(raw))) as WranglerConfig;
  } catch {
    return null;
  }
};

const normalizeTarget = (target?: string): string | undefined => {
  if (!isNonEmptyString(target)) return undefined;
  const trimmed = target.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getResolvedD1Name = (config: WranglerD1DatabaseConfig | undefined): string | undefined => {
  if (config === undefined) return undefined;
  if (isNonEmptyString(config.database_name)) return config.database_name.trim();
  if (isNonEmptyString(config.binding)) return config.binding.trim();
  return undefined;
};

const getD1Databases = (projectRoot: string): WranglerD1DatabaseConfig[] => {
  const parsed = readWranglerConfig(projectRoot);
  return Array.isArray(parsed?.d1_databases) ? parsed.d1_databases : [];
};

const getD1Database = (
  projectRoot: string,
  target?: string
): WranglerD1DatabaseConfig | undefined => {
  const list = getD1Databases(projectRoot);
  if (list.length === 0) return undefined;

  const normalizedTarget = normalizeTarget(target);
  if (normalizedTarget === undefined) return list[0] ?? undefined;

  return list.find(
    (database) =>
      database.binding?.trim() === normalizedTarget ||
      database.database_name?.trim() === normalizedTarget
  );
};

export const WranglerConfig = Object.freeze({
  getD1Databases(projectRoot: string): WranglerD1DatabaseConfig[] {
    return getD1Databases(projectRoot);
  },

  getD1Database(projectRoot: string, target?: string): WranglerD1DatabaseConfig | undefined {
    return getD1Database(projectRoot, target);
  },

  getDefaultD1Database(projectRoot: string): WranglerD1DatabaseConfig | undefined {
    return getD1Database(projectRoot);
  },

  getDefaultD1DatabaseName(projectRoot: string): string | undefined {
    return getResolvedD1Name(getD1Database(projectRoot));
  },

  getD1MigrationsDir(projectRoot: string, dbName?: string): string {
    const dir = getD1Database(projectRoot, dbName)?.migrations_dir;
    return isNonEmptyString(dir) ? dir.trim() : 'migrations';
  },
});
