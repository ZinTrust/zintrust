export type PrimitiveKey = string | number | boolean | null | undefined;

export type ICollection<T> = Readonly<{
  all: () => T[];
  toArray: () => T[];
  count: () => number;
  isEmpty: () => boolean;
  map: <U>(fn: (item: T, index: number) => U) => ICollection<U>;
  filter: (fn: (item: T, index: number) => boolean) => ICollection<T>;
  reduce: <U>(fn: (acc: U, item: T, index: number) => U, initial: U) => U;
  first: (fn?: (item: T, index: number) => boolean) => T | undefined;
  last: (fn?: (item: T, index: number) => boolean) => T | undefined;
  pluck: <K extends keyof T>(key: K) => ICollection<T[K]>;
  where: <K extends keyof T>(key: K, value: T[K]) => ICollection<T>;
  unique: (keySelector?: (item: T) => PrimitiveKey) => ICollection<T>;
  sortBy: (keySelector: (item: T) => PrimitiveKey) => ICollection<T>;
  chunk: (size: number) => ICollection<T[]>;
  take: (n: number) => ICollection<T>;
  skip: (n: number) => ICollection<T>;
  keyBy: <K extends PropertyKey>(keySelector: (item: T) => K) => ReadonlyMap<K, T>;
  groupBy: <K extends PropertyKey>(keySelector: (item: T) => K) => ReadonlyMap<K, ICollection<T>>;
  tap: (fn: (items: T[]) => void) => ICollection<T>;
  [Symbol.iterator]: () => Iterator<T>;
}>;

type CollectionSource<T> = Iterable<T> | ArrayLike<T> | null | undefined;

function normalizeToArray<T>(items: CollectionSource<T>): T[] {
  if (items === null || items === undefined) return [];

  if (typeof (items as Iterable<T>)[Symbol.iterator] === 'function') {
    return Array.from(items as Iterable<T>);
  }

  return Array.from(items as ArrayLike<T>);
}

function stableArray<T>(items: readonly T[]): T[] {
  return items.slice();
}

function firstMatch<T>(
  snapshot: readonly T[],
  fn?: (item: T, index: number) => boolean
): T | undefined {
  if (!fn) return snapshot[0];
  for (let i = 0; i < snapshot.length; i += 1) {
    if (fn(snapshot[i], i)) return snapshot[i];
  }
  return undefined;
}

function lastMatch<T>(
  snapshot: readonly T[],
  fn?: (item: T, index: number) => boolean
): T | undefined {
  if (!fn) return snapshot.at(-1);
  for (let i = snapshot.length - 1; i >= 0; i -= 1) {
    if (fn(snapshot[i], i)) return snapshot[i];
  }
  return undefined;
}

function uniqueItems<T>(snapshot: readonly T[], keySelector?: (item: T) => PrimitiveKey): T[] {
  const seen = new Set<PrimitiveKey>();
  const out: T[] = [];
  for (const item of snapshot) {
    const key = keySelector ? keySelector(item) : (item as unknown as PrimitiveKey);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function sortByKey<T>(snapshot: readonly T[], keySelector: (item: T) => PrimitiveKey): T[] {
  const out = snapshot.slice();
  out.sort((a, b) => {
    const ka = keySelector(a);
    const kb = keySelector(b);

    const aNil = ka === null || ka === undefined;
    const bNil = kb === null || kb === undefined;
    if (aNil && bNil) return 0;
    if (aNil) return 1;
    if (bNil) return -1;

    if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
    return String(ka).localeCompare(String(kb));
  });
  return out;
}

function chunkItems<T>(snapshot: readonly T[], size: number): T[][] {
  const n = Math.floor(size);
  if (!Number.isFinite(n) || n <= 0) return [];

  const out: T[][] = [];
  for (let i = 0; i < snapshot.length; i += n) {
    out.push(snapshot.slice(i, i + n));
  }
  return out;
}

function keyByItems<T, K extends PropertyKey>(
  snapshot: readonly T[],
  keySelector: (item: T) => K
): ReadonlyMap<K, T> {
  const out = new Map<K, T>();
  for (const item of snapshot) {
    out.set(keySelector(item), item);
  }
  return out;
}

function groupByItems<T, K extends PropertyKey>(
  snapshot: readonly T[],
  keySelector: (item: T) => K
): ReadonlyMap<K, ICollection<T>> {
  const groups = new Map<K, T[]>();
  for (const item of snapshot) {
    const key = keySelector(item);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const out = new Map<K, ICollection<T>>();
  for (const [k, bucket] of groups.entries()) {
    out.set(k, makeCollection(bucket));
  }
  return out;
}

function makeCollection<T>(items: readonly T[]): ICollection<T> {
  const snapshot = stableArray(items);

  const api: ICollection<T> = Object.freeze({
    all: () => snapshot.slice(),
    toArray: () => snapshot.slice(),
    count: () => snapshot.length,
    isEmpty: () => snapshot.length === 0,

    map: (fn) => makeCollection(snapshot.map(fn)),
    filter: (fn) => makeCollection(snapshot.filter(fn)),
    reduce: (fn, initial) => snapshot.reduce(fn, initial),

    first: (fn) => firstMatch(snapshot, fn),
    last: (fn) => lastMatch(snapshot, fn),

    pluck: (key) => makeCollection(snapshot.map((item) => item[key])),
    where: (key, value) => makeCollection(snapshot.filter((item) => item[key] === value)),

    unique: (keySelector) => makeCollection(uniqueItems(snapshot, keySelector)),
    sortBy: (keySelector) => makeCollection(sortByKey(snapshot, keySelector)),
    chunk: (size) => makeCollection(chunkItems(snapshot, size)),

    take: (n) => {
      const count = Math.max(0, Math.floor(n));
      return makeCollection(snapshot.slice(0, count));
    },

    skip: (n) => {
      const count = Math.max(0, Math.floor(n));
      return makeCollection(snapshot.slice(count));
    },

    keyBy: (keySelector) => keyByItems(snapshot, keySelector),
    groupBy: (keySelector) => groupByItems(snapshot, keySelector),

    tap: (fn) => {
      fn(snapshot.slice());
      return makeCollection(snapshot);
    },

    [Symbol.iterator]: function* () {
      for (const item of snapshot) yield item;
    },
  });

  return api;
}

export const Collection = Object.freeze({
  from: <T>(items: Iterable<T> | ArrayLike<T> | null | undefined): ICollection<T> =>
    makeCollection(normalizeToArray(items)),

  of: <T>(...items: T[]): ICollection<T> => makeCollection(items),

  isCollection: (value: unknown): value is ICollection<unknown> => {
    if (value === null || value === undefined) return false;
    return (
      typeof value === 'object' &&
      typeof (value as { all?: unknown }).all === 'function' &&
      typeof (value as { map?: unknown }).map === 'function' &&
      typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
    );
  },
});

export function collect<T>(items: Iterable<T> | ArrayLike<T> | null | undefined): ICollection<T> {
  return Collection.from(items);
}
