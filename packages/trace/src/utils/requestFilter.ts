import { TraceContext } from '../context';

type RequestIgnoreRules = {
  ignoreRoutes?: string[];
  ignorePaths?: string[];
};

type CompiledRules = {
  routes: string[];
  contains: string[];
};

const normalizePath = (input: string): string => {
  const trimmed = input.trim();
  const [pathOnly] = trimmed.split('?');
  if (!pathOnly || pathOnly === '') return '/';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
};

const normalizeContainsPattern = (input: string): string => {
  const trimmed = input.trim();
  const [pathOnly] = trimmed.split('?');
  return pathOnly ?? '';
};

const compileRules = (
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePaths?: string[]
): CompiledRules => {
  const routes = Array.isArray(ignoreRoutesOrRules)
    ? ignoreRoutesOrRules
    : (ignoreRoutesOrRules.ignoreRoutes ?? []);
  const contains = Array.isArray(ignoreRoutesOrRules)
    ? (ignorePaths ?? [])
    : (ignoreRoutesOrRules.ignorePaths ?? []);

  return {
    // Normalize route prefixes and trailing slashes once per rules object, not per emit.
    routes: routes.map((route) => {
      const normalized = normalizePath(route);
      return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    }),
    contains: contains
      .map(normalizeContainsPattern)
      .filter((pattern) => pattern.length > 0),
  };
};

// Watchers pass the same config arrays on every emit; cache the normalized form by identity.
const compiledByRules = new WeakMap<object, CompiledRules>();
const NO_PATHS = Object.freeze({});
const compiledByPair = new WeakMap<object, WeakMap<object, CompiledRules>>();

const resolveRules = (
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePaths?: string[]
): CompiledRules => {
  if (!Array.isArray(ignoreRoutesOrRules)) {
    const cached = compiledByRules.get(ignoreRoutesOrRules);
    if (cached !== undefined) return cached;
    const compiled = compileRules(ignoreRoutesOrRules);
    compiledByRules.set(ignoreRoutesOrRules, compiled);
    return compiled;
  }

  let byPaths = compiledByPair.get(ignoreRoutesOrRules);
  if (byPaths === undefined) {
    byPaths = new WeakMap<object, CompiledRules>();
    compiledByPair.set(ignoreRoutesOrRules, byPaths);
  }
  const pathsKey = ignorePaths ?? NO_PATHS;
  const cached = byPaths.get(pathsKey);
  if (cached !== undefined) return cached;
  const compiled = compileRules(ignoreRoutesOrRules, ignorePaths);
  byPaths.set(pathsKey, compiled);
  return compiled;
};

const matchesIgnoredPath = (
  path: string,
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePaths?: string[]
): boolean => {
  const normalizedPath = normalizePath(path);
  const rules = resolveRules(ignoreRoutesOrRules, ignorePaths);

  if (
    rules.routes.some(
      (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`)
    )
  ) {
    return true;
  }

  return rules.contains.some((containsPattern) => normalizedPath.includes(containsPattern));
};

const shouldIgnoreCurrentRequest = (
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePaths?: string[]
): boolean => {
  const currentPath = TraceContext.getRequestPath();
  if (typeof currentPath !== 'string' || currentPath === '') return false;
  return matchesIgnoredPath(currentPath, ignoreRoutesOrRules, ignorePaths);
};

export const RequestFilter = Object.freeze({
  matchesIgnoredPath,
  shouldIgnoreCurrentRequest,
  /** Precompile rules once at registration time for hot emit paths. */
  compileRules,
});
