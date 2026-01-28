/**
 * Routes Command
 * Lists all registered routes in a table.
 */

import { BaseCommand, type CommandOptions, type IBaseCommand } from '@cli/BaseCommand';
import { Env } from '@config/env';
import { Router } from '@core-routes/Router';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { Command } from 'commander';

type GroupByMode = 'group' | 'service' | 'none';

type RoutesCommandOptions = CommandOptions & {
  groupBy?: string;
  filter?: string;
  method?: string;
  json?: boolean;
};

type RouteRow = {
  url: string;
  group: string;
  method: string;
  path: string;
  middleware: string;
  validations: string;
  handler: string;
};

const parseGroupBy = (value: unknown): GroupByMode => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === '' || raw === 'group') return 'group';
  if (raw === 'service') return 'service';
  if (raw === 'none') return 'none';
  throw ErrorFactory.createCliError(
    `Invalid --group-by '${String(value)}'. Expected: group | service | none.`
  );
};

const parseMethodFilter = (value: unknown): Set<string> | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '') return null;
  const items = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
  return items.length === 0 ? null : new Set(items);
};

const normalizeHandlerName = (handler: unknown): string => {
  const name =
    typeof handler === 'function' &&
    typeof (handler as (...args: unknown[]) => unknown).name === 'string'
      ? (handler as (...args: unknown[]) => unknown).name
      : '';

  if (name.trim() === '') return '<anonymous>';
  return name.startsWith('bound ') ? name.slice('bound '.length) : name;
};

const normalizePath = (path: unknown): string => (typeof path === 'string' ? path : '');

const normalizePathForUrl = (path: string): string => {
  const raw = path.trim();
  if (raw === '') return '/';

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  // Avoid accidental double slashes when Router.group prefixes with '/api/v1' and child route starts with '/'
  return withLeadingSlash.replaceAll(/\/+/g, '/');
};

const getBaseOrigin = (): string => {
  const baseUrlRaw = Env.get('BASE_URL', Env.BASE_URL ?? '').trim();
  const port = Env.getInt(
    'PORT',
    typeof Env.PORT === 'number' && Number.isFinite(Env.PORT) ? Env.PORT : 0
  );

  // Treat empty or path-only values as "unset" (avoid weird results like ":3000")
  if (baseUrlRaw === '' || baseUrlRaw === '/' || baseUrlRaw.startsWith('/')) return '';

  const withScheme = baseUrlRaw.includes('://') ? baseUrlRaw : `http://${baseUrlRaw}`;

  try {
    const url = new URL(withScheme);
    if (url.port === '' && port > 0) {
      url.port = String(port);
    }
    return url.origin;
  } catch {
    // Fallback: best-effort string join
    const noTrailingSlash = baseUrlRaw.endsWith('/') ? baseUrlRaw.slice(0, -1) : baseUrlRaw;
    if (noTrailingSlash === '') return '';
    return port > 0 && !noTrailingSlash.includes(':')
      ? `${noTrailingSlash}:${port}`
      : noTrailingSlash;
  }
};

const buildFullUrl = (origin: string, path: string): string => {
  if (origin.trim() === '') return path;
  const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  const cleanPath = normalizePathForUrl(path);
  return `${cleanOrigin}${cleanPath}`;
};

const deriveGroup = (path: string): string => {
  if (path === '/' || path.trim() === '') return '/';

  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return '/';

  // Prefer deeper groups for common API patterns
  if (parts[0] === 'api' && parts[1] !== undefined) return `/api/${parts[1]}`;
  return `/${parts[0]}`;
};

const deriveService = (path: string): string => {
  if (path === '/' || path.trim() === '') return '/';

  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return '/';

  // For /api/v1/<service>/... group by <service>
  if (parts[0] === 'api' && parts[1] !== undefined) {
    const service = parts[2] ?? parts[1];
    return service === '' ? `/api/${parts[1]}` : service;
  }

  return parts[0];
};

const partitionMiddleware = (names: string[]): { middleware: string[]; validations: string[] } => {
  const validations: string[] = [];
  const middleware: string[] = [];

  for (const name of names) {
    if (name.toLowerCase().startsWith('validate')) {
      validations.push(name);
    } else {
      middleware.push(name);
    }
  }

  return { middleware, validations };
};

const unique = (items: string[]): string[] => Array.from(new Set(items));

const truncate = (value: string, max: number): string => {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, Math.max(0, max - 1))}…`;
};

const pad = (value: string, width: number): string => value.padEnd(width);

const renderTable = (rows: RouteRow[]): void => {
  /* eslint-disable no-console */
  const columns: Array<{ key: keyof RouteRow; title: string; max: number }> = [
    { key: 'url', title: 'URL', max: 64 },
    { key: 'group', title: 'Group', max: 18 },
    { key: 'method', title: 'Method', max: 6 },
    { key: 'path', title: 'Path', max: 42 },
    { key: 'middleware', title: 'Middleware', max: 28 },
    { key: 'validations', title: 'Validation', max: 24 },
    { key: 'handler', title: 'Handler', max: 28 },
  ];

  const widths = Object.fromEntries(
    columns.map((c) => {
      const contentMax = Math.max(
        c.title.length,
        ...rows.map((r) => truncate(String(r[c.key] ?? ''), c.max).length)
      );
      return [c.key, Math.min(c.max, Math.max(4, contentMax))];
    })
  ) as Record<keyof RouteRow, number>;

  const border = `┌${columns.map((c) => '─'.repeat(widths[c.key] + 2)).join('┬')}┐`;
  const mid = `├${columns.map((c) => '─'.repeat(widths[c.key] + 2)).join('┼')}┤`;
  const bottom = `└${columns.map((c) => '─'.repeat(widths[c.key] + 2)).join('┴')}┘`;

  const header = `│${columns
    .map((c) => ` ${pad(truncate(c.title, widths[c.key]), widths[c.key])} `)
    .join('│')}│`;

  console.log(border);
  console.log(header);
  console.log(mid);

  for (const row of rows) {
    const line = `│${columns
      .map((c) => {
        const cell = truncate(String(row[c.key] ?? ''), widths[c.key]);
        return ` ${pad(cell, widths[c.key])} `;
      })
      .join('│')}│`;

    console.log(line);
  }

  console.log(bottom);
  /* eslint-enable no-console */
};

const buildRows = async (options: RoutesCommandOptions): Promise<RouteRow[]> => {
  const groupBy = parseGroupBy(options.groupBy);
  const filterText = typeof options.filter === 'string' ? options.filter.trim().toLowerCase() : '';
  const methodFilter = parseMethodFilter(options.method);

  const baseOrigin = getBaseOrigin();

  const router = Router.createRouter();

  // Lazy load registerRoutes only when this command is actually executed
  const { registerRoutes } = await import('@routes/api');
  registerRoutes(router);

  const routes = Router.getRoutes(router);

  const rows = routes.map<RouteRow>((route) => {
    const path = normalizePath(route.path);
    let group = '';
    if (groupBy === 'service') {
      group = deriveService(path);
    } else if (groupBy === 'group') {
      group = deriveGroup(path);
    }

    const mwNames = Array.isArray(route.middleware)
      ? route.middleware.filter((m): m is string => typeof m === 'string')
      : [];

    const mw = partitionMiddleware(unique(mwNames));

    return {
      url: buildFullUrl(baseOrigin, path),
      group,
      method: String(route.method ?? '').toUpperCase(),
      path,
      middleware: mw.middleware.join(', '),
      validations: mw.validations.join(', '),
      handler: normalizeHandlerName(route.handler),
    };
  });

  const filtered = rows.filter((r) => {
    if (methodFilter?.has(r.method) === false) return false;

    if (filterText === '') return true;
    const haystack =
      `${r.url} ${r.group} ${r.method} ${r.path} ${r.middleware} ${r.validations} ${r.handler}`
        .toLowerCase()
        .trim();
    return haystack.includes(filterText);
  });

  // Keep stable ordering
  filtered.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

  return filtered;
};

const addOptions = (command: Command): void => {
  command
    .option('--group-by <mode>', 'group | service | none', 'group')
    .option('--filter <text>', 'Filter by substring (path/middleware/handler/etc)')
    .option('--method <methods>', 'Comma list of methods to include (e.g. GET,POST)')
    .option('--json', 'Output machine-readable JSON instead of a table');
};

const execute = async (cmd: IBaseCommand, options: RoutesCommandOptions): Promise<void> => {
  const rows = await buildRows(options);

  if (options.json === true) {
    /* eslint-disable no-console */
    console.log(JSON.stringify({ count: rows.length, routes: rows }, null, 2));
    /* eslint-enable no-console */
    return;
  }

  cmd.info(`Found ${rows.length} routes`);
  renderTable(rows);
};

export const RoutesCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'routes',
      aliases: ['route:list'],
      description:
        'List all routes (grouped by router group or service) with middleware and handler info',
      addOptions,
      execute: (options: CommandOptions): void | Promise<void> =>
        execute(cmd, options as RoutesCommandOptions),
    });

    return cmd;
  },
});

export default RoutesCommand;
