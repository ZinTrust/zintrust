import { TraceContext } from '../context';

type RequestIgnoreRules = {
  ignoreRoutes?: string[];
  ignorePath?: string[];
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

const resolveRules = (
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePath?: string[]
): Required<RequestIgnoreRules> => {
  if (Array.isArray(ignoreRoutesOrRules)) {
    return {
      ignoreRoutes: ignoreRoutesOrRules,
      ignorePath: ignorePath ?? [],
    };
  }

  return {
    ignoreRoutes: ignoreRoutesOrRules.ignoreRoutes ?? [],
    ignorePath: ignoreRoutesOrRules.ignorePath ?? [],
  };
};

const matchesIgnoredPath = (
  path: string,
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePath?: string[]
): boolean => {
  const normalizedPath = normalizePath(path);
  const rules = resolveRules(ignoreRoutesOrRules, ignorePath);

  if (
    rules.ignoreRoutes.some((route) => {
      const normalizedRoute = normalizePath(route);
      return (
        normalizedPath === normalizedRoute ||
        normalizedPath.startsWith(
          normalizedRoute.endsWith('/') ? normalizedRoute : `${normalizedRoute}/`
        )
      );
    })
  ) {
    return true;
  }

  return rules.ignorePath.some((route) => {
    const containsPattern = normalizeContainsPattern(route);
    if (containsPattern === '') return false;
    return normalizedPath.includes(containsPattern);
  });
};

const shouldIgnoreCurrentRequest = (
  ignoreRoutesOrRules: string[] | RequestIgnoreRules,
  ignorePath?: string[]
): boolean => {
  const currentPath = TraceContext.getRequestPath();
  if (typeof currentPath !== 'string' || currentPath === '') return false;
  return matchesIgnoredPath(currentPath, ignoreRoutesOrRules, ignorePath);
};

export const RequestFilter = Object.freeze({
  matchesIgnoredPath,
  shouldIgnoreCurrentRequest,
});
