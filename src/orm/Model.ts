/**
 * Enhanced Model with Relationships
 * Full ORM capabilities with eager/lazy loading
 */

import { DEFAULTS } from '@config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase, type IDatabase } from '@orm/Database';
import type { IQueryBuilder, InsertResult } from '@orm/QueryBuilder';
import { QueryBuilder, type QueryBuilderOptions } from '@orm/QueryBuilder';
import type { IRelationship } from '@orm/Relationships';
import { BelongsTo, BelongsToMany, HasMany, HasOne } from '@orm/Relationships';

const getRelatedTableName = (relatedModel: ModelStatic): string => {
  if (typeof relatedModel.getTable === 'function') {
    return relatedModel.getTable();
  }

  throw ErrorFactory.createConfigError('Related model does not provide a table name');
};

export interface ModelConfig {
  table: string;
  fillable: string[];
  hidden: string[];
  timestamps: boolean;
  casts: Record<string, string>;
  softDeletes?: boolean;
  accessors?: Record<string, (value: unknown, attrs: Record<string, unknown>) => unknown>;
  mutators?: Record<string, (value: unknown, attrs: Record<string, unknown>) => unknown>;
  scopes?: Record<string, (builder: IQueryBuilder, ...args: unknown[]) => IQueryBuilder>;
  observers?: Array<{
    saving?: (model: IModel) => void | Promise<void>;
    saved?: (model: IModel) => void | Promise<void>;
    creating?: (model: IModel) => void | Promise<void>;
    created?: (model: IModel) => void | Promise<void>;
    updating?: (model: IModel) => void | Promise<void>;
    updated?: (model: IModel) => void | Promise<void>;
    deleting?: (model: IModel) => void | Promise<void>;
    deleted?: (model: IModel) => void | Promise<void>;
  }>;
  connection?: string;
}

export interface ModelStatic {
  query(): IQueryBuilder;
  getTable?(): string;
  name?: string;
  hydrate?(attributes: Record<string, unknown>): IModel;
}

export interface IModel {
  fill(attributes: Record<string, unknown>): IModel;
  setAttribute(key: string, value: unknown): IModel;
  getAttribute(key: string): unknown;
  getAttributes(): Record<string, unknown>;
  save(): Promise<boolean>;
  delete(): Promise<boolean>;
  toJSON(): Record<string, unknown>;
  isDirty(key?: string): boolean;
  getTable(): string;
  exists(): boolean;
  setExists(exists: boolean): void;

  // Relation Management
  setRelation(name: string, value: unknown): void;
  getRelation<T>(name: string): T | undefined;

  // Relationships
  hasOne(relatedModel: ModelStatic, foreignKey?: string): IRelationship;
  hasMany(relatedModel: ModelStatic, foreignKey?: string): IRelationship;
  belongsTo(relatedModel: ModelStatic, foreignKey?: string): IRelationship;
  belongsToMany(
    relatedModel: ModelStatic,
    throughTable?: string,
    foreignKey?: string,
    relatedKey?: string
  ): IRelationship;
}

/**
 * Cast attribute value based on config
 */
const castAttribute = (config: ModelConfig, key: string, value: unknown): unknown => {
  const castType = config.casts[key];
  if (castType === undefined) return value;

  switch (castType) {
    case 'boolean':
      return value === true || value === 1 || value === '1';
    case 'integer':
      return Number.parseInt(String(value), 10);
    case 'float':
      return Number.parseFloat(String(value));
    case 'date':
      return new Date(String(value)).toISOString().split('T')[0];
    case 'datetime':
      return new Date(String(value)).toISOString();
    case 'json':
      return typeof value === 'string' ? JSON.parse(value) : value;
    default:
      return value;
  }
};

/**
 * Fill attributes based on fillable config
 */
const fillAttributes = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  newAttrs: Record<string, unknown>
): void => {
  for (const [key, value] of Object.entries(newAttrs)) {
    if (config.fillable.length === 0 || config.fillable.includes(key)) {
      const mutator = config.mutators?.[key];
      const nextValue = mutator ? mutator(value, attrs) : value;
      attrs[key] = castAttribute(config, key, nextValue);
    }
  }
};

const applyAccessor = (
  config: ModelConfig,
  key: string,
  attrs: Record<string, unknown>
): unknown => {
  const raw = attrs[key];
  const accessor = config.accessors?.[key];
  return accessor ? accessor(raw, attrs) : raw;
};

const runObservers = async (
  config: ModelConfig,
  hook:
    | 'saving'
    | 'saved'
    | 'creating'
    | 'created'
    | 'updating'
    | 'updated'
    | 'deleting'
    | 'deleted',
  model: IModel
): Promise<void> => {
  const observers = config.observers;
  if (observers === undefined || observers.length === 0) return;

  for (const observer of observers) {
    const fn = observer[hook];
    if (typeof fn === 'function') {
      // Observers intentionally run sequentially.
      // eslint-disable-next-line no-await-in-loop
      await fn(model);
    }
  }
};

const createModelJSON = (
  config: ModelConfig,
  attrs: Record<string, unknown>
): Record<string, unknown> => {
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!config.hidden.includes(key)) json[key] = value;
  }
  return json;
};

const createModelRelationships = (
  config: ModelConfig
): Pick<IModel, 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany'> => {
  return {
    hasOne: (relatedModel: ModelStatic, foreignKey?: string): IRelationship =>
      HasOne.create(relatedModel, foreignKey ?? `${config.table.slice(0, -1)}_id`, 'id'),
    hasMany: (relatedModel: ModelStatic, foreignKey?: string): IRelationship =>
      HasMany.create(relatedModel, foreignKey ?? `${config.table.slice(0, -1)}_id`, 'id'),
    belongsTo: (relatedModel: ModelStatic, foreignKey?: string): IRelationship => {
      const relatedTable = getRelatedTableName(relatedModel);
      return BelongsTo.create(relatedModel, foreignKey ?? `${relatedTable.slice(0, -1)}_id`, 'id');
    },
    belongsToMany: (
      relatedModel: ModelStatic,
      throughTable?: string,
      foreignKey?: string,
      relatedKey?: string
    ): IRelationship => {
      const relatedTable = getRelatedTableName(relatedModel);
      const table =
        throughTable ?? [config.table, relatedTable].sort((a, b) => a.localeCompare(b)).join('_');
      return BelongsToMany.create(
        relatedModel,
        table,
        foreignKey ?? `${config.table.slice(0, -1)}_id`,
        relatedKey ?? `${relatedTable.slice(0, -1)}_id`
      );
    },
  };
};

const performModelSave = async (
  model: IModel,
  config: ModelConfig,
  attrs: Record<string, unknown>,
  getDb: () => IDatabase,
  context: {
    isExists: boolean;
    setExists: (v: boolean) => void;
    updateOriginal: (v: Record<string, unknown>) => void;
    clearDirty: () => void;
  }
): Promise<boolean> => {
  const db = getDb();
  if (db === undefined) throw ErrorFactory.createDatabaseError('Database not initialized');

  const isCreate = context.isExists === false;
  await runObservers(config, 'saving', model);
  await runObservers(config, isCreate ? 'creating' : 'updating', model);

  if (config.timestamps) {
    attrs['created_at'] = attrs['created_at'] ?? new Date().toISOString();
    attrs['updated_at'] = new Date().toISOString();
  }
  context.setExists(true);
  context.updateOriginal({ ...attrs });
  context.clearDirty();

  await runObservers(config, isCreate ? 'created' : 'updated', model);
  await runObservers(config, 'saved', model);
  return true;
};

const performModelDelete = async (
  model: IModel,
  config: ModelConfig,
  getDb: () => IDatabase,
  isExists: boolean
): Promise<boolean> => {
  const db = getDb();
  if (!isExists || db === undefined) return false;

  await runObservers(config, 'deleting', model);
  await runObservers(config, 'deleted', model);
  return true;
};

/**
 * Create a new model instance
 */
export const createModel = (
  config: ModelConfig,
  attributes: Record<string, unknown> = {}
): IModel => {
  const connection = config.connection ?? DEFAULTS.CONNECTION;
  const getDb = (): IDatabase => useDatabase(undefined, connection);

  const attrs: Record<string, unknown> = {};
  const relations: Record<string, unknown> = {}; // Store eager loaded relations
  let original: Record<string, unknown> = {};
  let isExists = false;
  const dirtyFields = new Set<string>();

  fillAttributes(config, attrs, attributes);
  original = { ...attrs };

  const model = {
    fill: (newAttrs: Record<string, unknown>): IModel => {
      fillAttributes(config, attrs, newAttrs);
      // Mark all filled fields as dirty
      for (const key of Object.keys(newAttrs)) {
        if (attrs[key] !== original[key]) {
          dirtyFields.add(key);
        }
      }
      return model;
    },
    setAttribute: (key: string, value: unknown): IModel => {
      const mutator = config.mutators?.[key];
      const nextValue = mutator ? mutator(value, attrs) : value;
      const castedValue = castAttribute(config, key, nextValue);
      attrs[key] = castedValue;

      // Track dirty field
      if (original[key] === castedValue) {
        dirtyFields.delete(key);
      } else {
        dirtyFields.add(key);
      }

      return model;
    },
    getAttribute: (key: string): unknown => {
      // Check relations first if it's a relation name
      if (relations[key] !== undefined) return relations[key];
      return applyAccessor(config, key, attrs);
    },
    getAttributes: (): Record<string, unknown> => ({ ...attrs }),

    // Relationship helpers
    setRelation: (name: string, value: unknown): void => {
      relations[name] = value;
    },
    getRelation: <T>(name: string): T | undefined => relations[name] as T,

    // remove in production - use saveChanges pattern
    save: async (): Promise<boolean> =>
      performModelSave(model, config, attrs, getDb, {
        isExists,
        setExists: (v) => {
          isExists = v;
        },
        updateOriginal: (v) => {
          original = v;
        },
        clearDirty: () => dirtyFields.clear(),
      }),

    // remove in production - use delete pattern
    delete: async (): Promise<boolean> => performModelDelete(model, config, getDb, isExists),

    toJSON: (): Record<string, unknown> => createModelJSON(config, attrs),
    isDirty: (key?: string): boolean => {
      if (key !== undefined) {
        return dirtyFields.has(key);
      }
      return dirtyFields.size > 0;
    },
    getTable: (): string => config.table,
    exists: (): boolean => isExists,
    setExists: (exists: boolean): void => {
      isExists = exists;
    },
  } as IModel;

  Object.assign(model, createModelRelationships(config));

  return model;
};

/**
 * Get a query builder for a table
 */
export const query = (table: string, connection?: string): IQueryBuilder => {
  const db = useDatabase(undefined, connection ?? DEFAULTS.CONNECTION);
  return QueryBuilder.create(table, db);
};

const buildSoftDeleteOptions = (config: ModelConfig): QueryBuilderOptions | undefined => {
  if (config.softDeletes !== true) return undefined;
  return { softDeleteColumn: 'deleted_at', softDeleteMode: 'exclude' };
};

/**
 * Find a model by ID
 */
export const find = async (config: ModelConfig, id: unknown): Promise<IModel | null> => {
  const db = useDatabase(undefined, config.connection ?? DEFAULTS.CONNECTION);
  const builder = QueryBuilder.create(config.table, db, buildSoftDeleteOptions(config));
  builder.where('id', '=', String(id)).limit(1);
  const result = await builder.first();
  if (result === null) return null;

  const model = createModel(config, result as Record<string, unknown>);
  model.setExists(true);
  return model;
};

/**
 * Get all records for a model
 */
export const all = async (config: ModelConfig): Promise<IModel[]> => {
  const db = useDatabase(undefined, config.connection ?? DEFAULTS.CONNECTION);
  const builder = QueryBuilder.create(config.table, db, buildSoftDeleteOptions(config));
  const results = await builder.get();
  return results.map((result) => {
    const model = createModel(config, result as Record<string, unknown>);
    model.setExists(true);
    return model;
  });
};

type UnboundModelMethods = Record<string, (m: IModel, ...args: unknown[]) => unknown>;
type BoundModelMethods = Record<string, (...args: never[]) => unknown>;

type BoundFromUnbound<T extends UnboundModelMethods> = {
  [K in keyof T]: T[K] extends (m: IModel, ...args: infer A) => infer R ? (...args: A) => R : never;
};

const bindUnboundMethods = <T extends UnboundModelMethods>(
  model: IModel,
  methods: T
): BoundFromUnbound<T> => {
  const bound: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [name, method] of Object.entries(methods)) {
    bound[name] = (...args: unknown[]): unknown => method(model, ...args);
  }
  return bound as BoundFromUnbound<T>;
};

const extendModel = <T extends BoundModelMethods>(model: IModel, methods: T): IModel & T => {
  const extended = { ...model } as Record<string, unknown>;
  for (const [name, method] of Object.entries(methods)) {
    extended[name] = method;
  }
  return extended as IModel & T;
};

export type DefinedModel<T extends BoundModelMethods> = {
  create: (attributes?: Record<string, unknown> | undefined) => IModel & T;
  hydrate: (attributes: Record<string, unknown>) => IModel & T;
  hydrateWithRelations(
    attributes: Record<string, unknown>,
    related: Record<string, unknown>
  ): IModel & T;
  find: (id: unknown) => Promise<(IModel & T) | null>;
  all: () => Promise<Array<IModel & T>>;
  raw: () => Promise<Array<Record<string, unknown>>>;
  query: () => IQueryBuilder;
  scope: (name: string, ...args: unknown[]) => IQueryBuilder;
  getTable: () => string;
  db: (connection: string) => DefinedModel<T>;
};

type MethodsOrPlan = UnboundModelMethods | ((model: IModel) => BoundModelMethods) | undefined;
type AnyFunction = (...args: unknown[]) => unknown;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isRelationship = (value: unknown): value is IRelationship => {
  if (!isRecord(value)) return false;
  return 'type' in value && 'get' in value;
};

const createModelBuilder = (cfg: ModelConfig): IQueryBuilder => {
  const db = useDatabase(undefined, cfg.connection ?? DEFAULTS.CONNECTION);
  return QueryBuilder.create(cfg.table, db, buildSoftDeleteOptions(cfg));
};

const createHydrator = (
  cfg: ModelConfig,
  attach: (model: IModel) => IModel & BoundModelMethods
) => {
  return (attributes: Record<string, unknown>): IModel & BoundModelMethods => {
    const model = createModel(cfg, attributes);
    model.setExists(true);
    return attach(model);
  };
};

const createRelationMapping = (
  cfg: ModelConfig,
  resolveMethods: (model: IModel) => BoundModelMethods
): Record<string, IRelationship> => {
  const dummyModel = createModel(cfg);
  const methods = resolveMethods(dummyModel);

  const relationMapping: Record<string, IRelationship> = {};
  for (const [name, fn] of Object.entries(methods) as Array<[string, AnyFunction]>) {
    try {
      const result = fn();
      if (isRelationship(result)) {
        relationMapping[name] = result;
      }
    } catch {
      // Not a relationship call or requires params
    }
  }

  return relationMapping;
};

const wrapBuilderGetForEagerLoading = (
  builder: IQueryBuilder,
  hydrateModel: (attributes: Record<string, unknown>) => IModel & BoundModelMethods
): void => {
  const eagerBuilder = builder as unknown as {
    get: () => Promise<unknown>;
    getEagerLoads?: () => string[];
    load?: (models: Array<IModel & BoundModelMethods>, relation: string) => Promise<void>;
  };

  const originalGet = eagerBuilder.get.bind(builder);
  eagerBuilder.get = async (): Promise<unknown> => {
    const raw = await originalGet();
    if (!Array.isArray(raw)) return raw;

    const rows = raw.filter(isRecord);
    const models = rows.map(hydrateModel);

    const eagerLoads =
      typeof eagerBuilder.getEagerLoads === 'function' ? eagerBuilder.getEagerLoads() : undefined;
    if (
      Array.isArray(eagerLoads) &&
      eagerLoads.length > 0 &&
      typeof eagerBuilder.load === 'function' &&
      models.length > 0
    ) {
      await Promise.all(eagerLoads.map(async (relation) => eagerBuilder.load?.(models, relation)));
    }

    return models;
  };
};

const createDefinedModelInternal = (
  cfg: ModelConfig,
  methodsOrPlan: MethodsOrPlan,
  attach: (model: IModel) => IModel & BoundModelMethods,
  resolveMethods: (model: IModel) => BoundModelMethods
): DefinedModel<BoundModelMethods> => {
  const relationMapping = createRelationMapping(cfg, resolveMethods);
  const hydrateModel = createHydrator(cfg, attach);

  return {
    create: (attributes: Record<string, unknown> = {}): IModel & BoundModelMethods =>
      attach(createModel(cfg, attributes)),
    hydrate: (attributes: Record<string, unknown>): IModel & BoundModelMethods =>
      hydrateModel(attributes),
    find: async (id: unknown): Promise<(IModel & BoundModelMethods) | null> => {
      const model = await find(cfg, id);
      return model === null ? null : attach(model);
    },
    all: async (): Promise<Array<IModel & BoundModelMethods>> => {
      const models = await all(cfg);
      return models.map((m) => attach(m));
    },
    raw: async (): Promise<Array<Record<string, unknown>>> => {
      const builder = createModelBuilder(cfg);
      return builder.get();
    },
    query: (): IQueryBuilder => {
      const builder = createModelBuilder(cfg);
      wrapBuilderGetForEagerLoading(builder, hydrateModel);
      return builder;
    },
    scope: (name: string, ...args: unknown[]): IQueryBuilder => {
      const fn = cfg.scopes?.[name];
      if (typeof fn !== 'function') {
        throw ErrorFactory.createConfigError(`Unknown query scope: ${name}`);
      }
      const builder = createModelBuilder(cfg);
      return fn(builder, ...args);
    },
    getTable: (): string => cfg.table,
    db: (connection: string): DefinedModel<BoundModelMethods> =>
      createDefinedModelInternal({ ...cfg, connection }, methodsOrPlan, attach, resolveMethods),
    hydrateWithRelations(
      attributes: Record<string, unknown>,
      related: Record<string, unknown>
    ): IModel & BoundModelMethods {
      const model = hydrateModel(attributes);

      for (const [name, data] of Object.entries(related)) {
        const rel = relationMapping[name];
        if (rel === undefined) continue;

        const relatedStatic = rel.related;
        const hydrate = relatedStatic.hydrate;
        if (typeof hydrate !== 'function') continue;

        if (Array.isArray(data)) {
          const relatedModels = data.filter(isRecord).map((d) => hydrate(d));
          model.setRelation(name, relatedModels);
          continue;
        }

        if (data !== null && data !== undefined && isRecord(data)) {
          const relatedModel = hydrate(data);
          model.setRelation(name, relatedModel);
        }
      }

      return model;
    },
  };
};

/**
 * Define a new model type
 */
export function define<const T extends UnboundModelMethods>(
  config: ModelConfig,
  methods?: T
): DefinedModel<BoundFromUnbound<T>>;
export function define<const T extends BoundModelMethods>(
  config: ModelConfig,
  plan: (model: IModel) => T
): DefinedModel<T>;
export function define(
  config: ModelConfig,
  methodsOrPlan?: UnboundModelMethods | ((model: IModel) => BoundModelMethods)
): DefinedModel<BoundModelMethods> {
  const plan = typeof methodsOrPlan === 'function' ? methodsOrPlan : undefined;
  const unboundMethods = typeof methodsOrPlan === 'function' ? undefined : methodsOrPlan;

  const resolveMethods = (model: IModel): BoundModelMethods => {
    return plan ? plan(model) : bindUnboundMethods(model, unboundMethods ?? {});
  };

  const attach = (model: IModel): IModel & BoundModelMethods => {
    const methods = resolveMethods(model);
    return extendModel(model, methods);
  };

  return createDefinedModelInternal(config, methodsOrPlan, attach, resolveMethods);
}

/**
 * Insert a single or multiple records into the database
 * Returns insert metadata including ID and affected rows
 */
const insert = async (
  config: ModelConfig,
  values: Record<string, unknown> | Array<Record<string, unknown>>
): Promise<InsertResult> => {
  const db = useDatabase(undefined, config.connection ?? DEFAULTS.CONNECTION);
  const builder = QueryBuilder.create(config.table, db, buildSoftDeleteOptions(config));
  return builder.insert(values);
};

/**
 * Batch insert multiple records (alias for insert with array)
 */
const bulkInsert = async (
  config: ModelConfig,
  records: Array<Record<string, unknown>>
): Promise<InsertResult> => {
  return insert(config, records);
};

/**
 * Model namespace - sealed namespace object grouping all model operations
 * Frozen to prevent accidental mutation
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const Model = Object.freeze({
  create: createModel,
  query,
  find,
  all,
  insert,
  bulkInsert,
  define,
});
