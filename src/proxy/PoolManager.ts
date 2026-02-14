export type PoolFactory<T> = () => T;
export type PoolDisposer<T> = (pool: T) => Promise<void> | void;

export type PoolManager<T> = Readonly<{
  get: () => T;
  dispose: () => Promise<void>;
}>;

export const createPoolManager = <T>(
  create: PoolFactory<T>,
  dispose: PoolDisposer<T>
): PoolManager<T> => {
  let pool: T | null = null;

  const get = (): T => {
    pool ??= create();
    return pool;
  };

  const disposePool = async (): Promise<void> => {
    if (pool === null) return;
    const current = pool;
    pool = null;
    await Promise.resolve(dispose(current));
  };

  return Object.freeze({
    get,
    dispose: disposePool,
  });
};
