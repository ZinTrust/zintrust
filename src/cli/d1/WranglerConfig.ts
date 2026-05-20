import { isNonEmptyString } from '@helper/index';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export type WranglerD1DatabaseConfig = {
  binding?: string;
  database_name?: string;
  database_id?: string;
  migrations_dir?: string;
  remote?: boolean;
};

export type WranglerD1ResolutionMatch = 'database_name' | 'binding' | 'single-configured';

export type WranglerD1DatabaseResolution =
  | {
      status: 'resolved';
      target?: string;
      config: WranglerD1DatabaseConfig;
      matchedBy: WranglerD1ResolutionMatch;
      configured: WranglerD1DatabaseConfig[];
      matches: WranglerD1DatabaseConfig[];
    }
  | {
      status: 'ambiguous';
      target?: string;
      matchedBy: 'database_name' | 'binding' | 'multiple-configured';
      configured: WranglerD1DatabaseConfig[];
      matches: WranglerD1DatabaseConfig[];
    }
  | {
      status: 'missing';
      target?: string;
      configured: WranglerD1DatabaseConfig[];
      matches: WranglerD1DatabaseConfig[];
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

const getBindingName = (config: WranglerD1DatabaseConfig | undefined): string | undefined => {
  if (config === undefined || !isNonEmptyString(config.binding)) return undefined;
  return config.binding.trim();
};

const getDatabaseName = (config: WranglerD1DatabaseConfig | undefined): string | undefined => {
  if (config === undefined || !isNonEmptyString(config.database_name)) return undefined;
  return config.database_name.trim();
};

const getD1Databases = (projectRoot: string): WranglerD1DatabaseConfig[] => {
  const parsed = readWranglerConfig(projectRoot);
  return Array.isArray(parsed?.d1_databases) ? parsed.d1_databases : [];
};

const resolveImplicitD1Database = (
  configured: WranglerD1DatabaseConfig[],
  target?: string
): WranglerD1DatabaseResolution => {
  if (configured.length === 1 && configured[0] !== undefined) {
    return {
      status: 'resolved',
      target,
      config: configured[0],
      matchedBy: 'single-configured',
      configured,
      matches: [configured[0]],
    };
  }

  return {
    status: 'ambiguous',
    target,
    matchedBy: 'multiple-configured',
    configured,
    matches: configured,
  };
};

const resolveTargetedD1Database = (
  configured: WranglerD1DatabaseConfig[],
  target: string
): WranglerD1DatabaseResolution => {
  const databaseNameMatches = configured.filter((database) => getDatabaseName(database) === target);

  if (databaseNameMatches.length === 1 && databaseNameMatches[0] !== undefined) {
    return {
      status: 'resolved',
      target,
      config: databaseNameMatches[0],
      matchedBy: 'database_name',
      configured,
      matches: databaseNameMatches,
    };
  }

  if (databaseNameMatches.length > 1) {
    return {
      status: 'ambiguous',
      target,
      matchedBy: 'database_name',
      configured,
      matches: databaseNameMatches,
    };
  }

  const bindingMatches = configured.filter((database) => getBindingName(database) === target);

  if (bindingMatches.length === 1 && bindingMatches[0] !== undefined) {
    return {
      status: 'resolved',
      target,
      config: bindingMatches[0],
      matchedBy: 'binding',
      configured,
      matches: bindingMatches,
    };
  }

  if (bindingMatches.length > 1) {
    return {
      status: 'ambiguous',
      target,
      matchedBy: 'binding',
      configured,
      matches: bindingMatches,
    };
  }

  return {
    status: 'missing',
    target,
    configured,
    matches: [],
  };
};

const resolveD1Database = (projectRoot: string, target?: string): WranglerD1DatabaseResolution => {
  const configured = getD1Databases(projectRoot);
  const normalizedTarget = normalizeTarget(target);

  if (configured.length === 0) {
    return {
      status: 'missing',
      target: normalizedTarget,
      configured,
      matches: [],
    };
  }

  if (normalizedTarget === undefined) {
    return resolveImplicitD1Database(configured, normalizedTarget);
  }

  return resolveTargetedD1Database(configured, normalizedTarget);
};

const getD1Database = (
  projectRoot: string,
  target?: string
): WranglerD1DatabaseConfig | undefined => {
  const resolution = resolveD1Database(projectRoot, target);
  return resolution.status === 'resolved' ? resolution.config : undefined;
};

export const WranglerConfig = Object.freeze({
  getD1Databases(projectRoot: string): WranglerD1DatabaseConfig[] {
    return getD1Databases(projectRoot);
  },

  getD1Database(projectRoot: string, target?: string): WranglerD1DatabaseConfig | undefined {
    return getD1Database(projectRoot, target);
  },

  resolveD1Database(projectRoot: string, target?: string): WranglerD1DatabaseResolution {
    return resolveD1Database(projectRoot, target);
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
