/**
 * Enhanced Model with Relationships
 * Full ORM capabilities with eager/lazy loading
 */

import { DEFAULTS } from '@config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase } from '@orm/Database';
import { IQueryBuilder, QueryBuilder, type QueryBuilderOptions } from '@orm/QueryBuilder';
import { BelongsTo, BelongsToMany, HasMany, HasOne, IRelationship } from '@orm/Relationships';

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
): {
  hasOne: (relatedModel: ModelStatic, foreignKey?: string) => IRelationship;
  hasMany: (relatedModel: ModelStatic, foreignKey?: string) => IRelationship;
  belongsTo: (relatedModel: ModelStatic, foreignKey?: string) => IRelationship;
  belongsToMany: (
    relatedModel: ModelStatic,
    throughTable?: string,
    foreignKey?: string,
    relatedKey?: string
  ) => IRelationship;
} => ({
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
});

/**
 * Create a new model instance
 */
export const createModel = (
  config: ModelConfig,
  attributes: Record<string, unknown> = {}
): IModel => {
  const connection = config.connection ?? DEFAULTS.CONNECTION;
  const db = useDatabase(undefined, connection);
  const attrs: Record<string, unknown> = {};
  let original: Record<string, unknown> = {};
  let isExists = false;

  fillAttributes(config, attrs, attributes);
  original = { ...attrs };

  const model: IModel = {
    fill: (newAttrs): IModel => {
      fillAttributes(config, attrs, newAttrs);
      return model;
    },
    setAttribute: (key, value): IModel => {
      const mutator = config.mutators?.[key];
      const nextValue = mutator ? mutator(value, attrs) : value;
      attrs[key] = castAttribute(config, key, nextValue);
      return model;
    },
    getAttribute: (key): unknown => applyAccessor(config, key, attrs),
    getAttributes: (): Record<string, unknown> => ({ ...attrs }),

    // remove in production - use saveChanges pattern
    async save(): Promise<boolean> {
      if (db === undefined) throw ErrorFactory.createDatabaseError('Database not initialized');

      const isCreate = isExists === false;
      await runObservers(config, 'saving', model);
      await runObservers(config, isCreate ? 'creating' : 'updating', model);

      if (config.timestamps) {
        attrs['created_at'] = attrs['created_at'] ?? new Date().toISOString();
        attrs['updated_at'] = new Date().toISOString();
      }
      isExists = true;
      original = { ...attrs };

      await runObservers(config, isCreate ? 'created' : 'updated', model);
      await runObservers(config, 'saved', model);
      return true;
    },

    // remove in production - use delete pattern
    async delete(): Promise<boolean> {
      if (!isExists || db === undefined) return false;

      await runObservers(config, 'deleting', model);
      await runObservers(config, 'deleted', model);
      return true;
    },
    toJSON: (): Record<string, unknown> => createModelJSON(config, attrs),
    isDirty: (key): boolean =>
      key === undefined
        ? JSON.stringify(attrs) !== JSON.stringify(original)
        : attrs[key] !== original[key],
    getTable: (): string => config.table,
    exists: (): boolean => isExists,
    setExists: (exists: boolean): void => {
      isExists = exists;
    },
    ...createModelRelationships(config),
  };

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
  find: (id: unknown) => Promise<(IModel & T) | null>;
  all: () => Promise<Array<IModel & T>>;
  query: () => IQueryBuilder;
  scope: (name: string, ...args: unknown[]) => IQueryBuilder;
  getTable: () => string;
  db: (connection: string) => DefinedModel<T>;
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
  const isPlan = typeof methodsOrPlan === 'function';

  const attach = (model: IModel): IModel & BoundModelMethods => {
    const methods = isPlan
      ? (methodsOrPlan as (m: IModel) => BoundModelMethods)(model)
      : bindUnboundMethods(model, methodsOrPlan ?? {});
    return extendModel(model, methods);
  };

  const createDefinedModel = (cfg: ModelConfig): DefinedModel<BoundModelMethods> => ({
    create: (attributes: Record<string, unknown> = {}): (IModel & BoundModelMethods) | never =>
      attach(createModel(cfg, attributes)),
    find: async (id: unknown): Promise<(IModel & BoundModelMethods) | null> => {
      const model = await find(cfg, id);
      return model === null ? null : attach(model);
    },
    all: async (): Promise<Array<IModel & BoundModelMethods>> => {
      const models = await all(cfg);
      return models.map((m) => attach(m));
    },
    query: (): IQueryBuilder => {
      const db = useDatabase(undefined, cfg.connection ?? DEFAULTS.CONNECTION);
      return QueryBuilder.create(cfg.table, db, buildSoftDeleteOptions(cfg));
    },
    scope: (name: string, ...args: unknown[]): IQueryBuilder => {
      const scopes = cfg.scopes;
      const fn = scopes?.[name];
      if (typeof fn !== 'function') {
        throw ErrorFactory.createConfigError(`Unknown query scope: ${name}`);
      }
      const builder = (() => {
        const db = useDatabase(undefined, cfg.connection ?? DEFAULTS.CONNECTION);
        return QueryBuilder.create(cfg.table, db, buildSoftDeleteOptions(cfg));
      })();
      return fn(builder, ...args);
    },
    getTable: (): string => cfg.table,
    db: (connection: string): DefinedModel<BoundModelMethods> =>
      createDefinedModel({ ...cfg, connection }),
  });

  return createDefinedModel(config);
}

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
  define,
});
