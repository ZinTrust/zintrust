import { describe, expect, it } from 'vitest';
import { QueryBuilder } from '../../src/orm/QueryBuilder';

describe('QueryBuilder - insert validation', () => {
  it('throws when insert values have no keys', async () => {
    const builder = QueryBuilder.create('users', undefined as any);
    await expect(builder.insert({} as any)).rejects.toThrowError();
  });
});

describe('QueryBuilder - load() relationship mapping', () => {
  it('maps hasMany relation results back to models', async () => {
    const builder = QueryBuilder.create('users', undefined as any);

    // Create two simple model-like objects
    const mockModels: any[] = [
      {
        id: 1,
        getAttribute(k: string) {
          if (k === 'id') return 1;
          return undefined;
        },
        setRelation(name: string, value: any) {
          this[`rel_${name}`] = value;
        },
      },
      {
        id: 2,
        getAttribute(k: string) {
          if (k === 'id') return 2;
          return undefined;
        },
        setRelation(name: string, value: any) {
          this[`rel_${name}`] = value;
        },
      },
    ];

    // Create relatedResults with getAttribute implementation
    const relatedResults = [
      { getAttribute: (k: string) => (k === 'user_id' ? 1 : undefined) },
      { getAttribute: (k: string) => (k === 'user_id' ? 2 : undefined) },
    ];

    // Related model with query().whereIn(...).get() -> returns relatedResults
    const relatedModel = {
      query: () => ({
        whereIn: () => ({ get: async () => relatedResults }),
      }),
    };

    // Define a relationship function on first model
    mockModels[0].projects = () => ({
      type: 'hasMany',
      foreignKey: 'user_id',
      localKey: 'id',
      related: relatedModel,
    });
    mockModels[1].projects = mockModels[0].projects;

    await builder.load(mockModels as any, 'projects');

    expect(Array.isArray(mockModels[0].rel_projects)).toBe(true);
    expect(Array.isArray(mockModels[1].rel_projects)).toBe(true);
  });

  it('maps singular relation (hasOne/belongsTo) back to models', async () => {
    const builder = QueryBuilder.create('users', undefined as any);

    const model = {
      getAttribute(k: string) {
        if (k === 'id') return 1;
        return undefined;
      },
      setRelation(name: string, value: any) {
        this[`rel_${name}`] = value;
      },
    } as any;

    const relatedResults = [{ getAttribute: (k: string) => (k === 'user_id' ? 1 : undefined) }];

    const relatedModel = {
      query: () => ({ whereIn: () => ({ get: async () => relatedResults }) }),
    };

    model.owner = () => ({
      type: 'hasOne',
      foreignKey: 'user_id',
      localKey: 'id',
      related: relatedModel,
    });

    await builder.load([model], 'owner');

    expect(model.rel_owner !== undefined).toBe(true);
  });
});
