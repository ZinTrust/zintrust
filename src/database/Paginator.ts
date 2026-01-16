/**
 * Paginator helpers
 * Creates consistent pagination metadata for list responses.
 */

import { ErrorFactory } from '@exceptions/ZintrustError';

export type PaginationQueryValue = string | number | boolean | null | undefined;
export type PaginationQuery = Record<string, PaginationQueryValue>;

export type PaginationLinks = {
  first?: string;
  last?: string;
  prev?: string;
  next?: string;
};

export type Paginator<T> = {
  items: T[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  from: number;
  to: number;
  links: PaginationLinks;
};

export type CreatePaginatorInput<T> = {
  items: T[];
  total: number;
  perPage: number;
  currentPage: number;
  baseUrl?: string;
  query?: PaginationQuery;
};

const normalizePositiveInt = (value: number, label: string): number => {
  const n = Math.trunc(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw ErrorFactory.createValidationError(`${label} must be a positive integer`);
  }
  return n;
};

const normalizeNonNegativeInt = (value: number): number => {
  const n = Math.trunc(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const applyQueryParams = (url: URL, query?: PaginationQuery): void => {
  if (query === undefined) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
};

const buildPageUrl = (
  baseUrl: string,
  page: number,
  perPage: number,
  query?: PaginationQuery
): string => {
  const url = new URL(baseUrl, 'http://localhost');
  applyQueryParams(url, query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

const getLinks = (
  baseUrl: string | undefined,
  currentPage: number,
  lastPage: number,
  perPage: number,
  query?: PaginationQuery
): PaginationLinks => {
  if (baseUrl === undefined || baseUrl.trim() === '') return {};

  return {
    first: buildPageUrl(baseUrl, 1, perPage, query),
    last: buildPageUrl(baseUrl, lastPage, perPage, query),
    prev: currentPage > 1 ? buildPageUrl(baseUrl, currentPage - 1, perPage, query) : undefined,
    next:
      currentPage < lastPage ? buildPageUrl(baseUrl, currentPage + 1, perPage, query) : undefined,
  };
};

export const Paginator = Object.freeze({
  create<T>(input: CreatePaginatorInput<T>): Paginator<T> {
    const perPage = normalizePositiveInt(input.perPage, 'perPage');
    const currentPage = normalizePositiveInt(input.currentPage, 'currentPage');
    const total = normalizeNonNegativeInt(input.total);

    const lastPage = total === 0 ? 1 : Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(currentPage, lastPage);

    const from = total === 0 ? 0 : (safePage - 1) * perPage + 1;
    const to = total === 0 ? 0 : Math.min(from + input.items.length - 1, total);

    return {
      items: input.items,
      total,
      perPage,
      currentPage: safePage,
      lastPage,
      from,
      to,
      links: getLinks(input.baseUrl, safePage, lastPage, perPage, input.query),
    };
  },
});

export const createPaginator = <T>(input: CreatePaginatorInput<T>): Paginator<T> => {
  return Paginator.create(input);
};

export const getNextPageUrl = (
  paginator: Paginator<unknown>,
  baseUrl: string,
  query?: PaginationQuery
): string | undefined => {
  if (paginator.currentPage >= paginator.lastPage) return undefined;
  return buildPageUrl(baseUrl, paginator.currentPage + 1, paginator.perPage, query);
};

export const getPrevPageUrl = (
  paginator: Paginator<unknown>,
  baseUrl: string,
  query?: PaginationQuery
): string | undefined => {
  if (paginator.currentPage <= 1) return undefined;
  return buildPageUrl(baseUrl, paginator.currentPage - 1, paginator.perPage, query);
};
