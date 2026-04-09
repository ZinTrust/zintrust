import { TraceContext } from '../context';

const normalizePath = (input: string): string => {
  const trimmed = input.trim();
  const [pathOnly] = trimmed.split('?');
  if (!pathOnly || pathOnly === '') return '/';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
};

const matchesIgnoredPath = (path: string, ignoreRoutes: string[]): boolean => {
  const normalizedPath = normalizePath(path);

  return ignoreRoutes.some((route) => {
    const normalizedRoute = normalizePath(route);
    return (
      normalizedPath === normalizedRoute ||
      normalizedPath.startsWith(
        normalizedRoute.endsWith('/') ? normalizedRoute : `${normalizedRoute}/`
      )
    );
  });
};

const shouldIgnoreCurrentRequest = (ignoreRoutes: string[]): boolean => {
  const currentPath = TraceContext.getRequestPath();
  if (typeof currentPath !== 'string' || currentPath === '') return false;
  return matchesIgnoredPath(currentPath, ignoreRoutes);
};

export const RequestFilter = Object.freeze({
  matchesIgnoredPath,
  shouldIgnoreCurrentRequest,
});
