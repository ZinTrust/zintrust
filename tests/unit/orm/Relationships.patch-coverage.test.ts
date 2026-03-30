import { HasManyThrough, HasOneThrough } from '@orm/Relationships';
import { describe, expect, it, vi } from 'vitest';

type QueryStub = {
  join: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const createQueryStub = (): QueryStub => {
  const query: QueryStub = {
    join: vi.fn(),
    where: vi.fn(),
    first: vi.fn(),
    get: vi.fn(),
  };

  query.join.mockReturnValue(query);
  query.where.mockReturnValue(query);

  return query;
};

const createModelStatic = (table: string, query: QueryStub) => ({
  getTable: () => table,
  query: () => query,
});

const createInstance = (attributes: Record<string, unknown>) => ({
  getAttribute: (key: string) => attributes[key],
});

describe('Relationships patch coverage', () => {
  it('through relationships short-circuit on empty local keys', async () => {
    const query = createQueryStub();
    const relatedModel = createModelStatic('posts', query);
    const throughModel = createModelStatic('users', query);

    const many = HasManyThrough.create(relatedModel as never, throughModel as never);
    const one = HasOneThrough.create(relatedModel as never, throughModel as never);

    await expect(many.get(createInstance({ id: '' }) as never)).resolves.toEqual([]);
    await expect(one.get(createInstance({ id: null }) as never)).resolves.toBeNull();

    expect(query.join).not.toHaveBeenCalled();
    expect(query.where).not.toHaveBeenCalled();
  });

  it('through relationships build join queries and return first/get results', async () => {
    const manyQuery = createQueryStub();
    const oneQuery = createQueryStub();

    const posts = [{ id: 1 }, { id: 2 }];
    const profile = { id: 9 };

    manyQuery.get.mockResolvedValue(posts);
    oneQuery.first.mockResolvedValue(profile);

    const manyRelatedModel = createModelStatic('posts', manyQuery);
    const oneRelatedModel = createModelStatic('profiles', oneQuery);
    const throughModel = createModelStatic('users', manyQuery);
    const throughModelForOne = createModelStatic('users', oneQuery);
    const instance = createInstance({ id: 7 });

    const many = HasManyThrough.create(manyRelatedModel as never, throughModel as never);
    const one = HasOneThrough.create(oneRelatedModel as never, throughModelForOne as never);

    await expect(many.get(instance as never)).resolves.toEqual(posts);
    await expect(one.get(instance as never)).resolves.toEqual(profile);

    expect(manyQuery.join).toHaveBeenCalledWith('users', 'posts.user_id = users.id');
    expect(manyQuery.where).toHaveBeenCalledWith('users.id', '=', 7);
    expect(manyQuery.get).toHaveBeenCalledTimes(1);

    expect(oneQuery.join).toHaveBeenCalledWith('users', 'profiles.user_id = users.id');
    expect(oneQuery.where).toHaveBeenCalledWith('users.id', '=', 7);
    expect(oneQuery.first).toHaveBeenCalledTimes(1);
  });
});
