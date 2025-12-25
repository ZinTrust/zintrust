/**
 * Enhanced Model with Relationships
 * Full ORM capabilities with eager/lazy loading
 */

import { DEFAULTS } from '@config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase } from '@orm/Database';
import { IQueryBuilder, QueryBuilder } from '@orm/QueryBuilder';
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
}

export interface ModelConfig {
  table: string;
  fillable: string[];
  hidden: string[];
  timestamps: boolean;
  casts: Record<string, string>;
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
      attrs[key] = castAttribute(config, key, value);
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
      attrs[key] = castAttribute(config, key, value);
      return model;
    },
    getAttribute: (key): unknown => attrs[key],
    getAttributes: (): Record<string, unknown> => ({ ...attrs }),

    // remove in production - use saveChanges pattern
    // eslint-disable-next-line @typescript-eslint/require-await
    async save(): Promise<boolean> {
      if (db === undefined) throw ErrorFactory.createDatabaseError('Database not initialized');
      if (config.timestamps) {
        attrs['created_at'] = attrs['created_at'] ?? new Date().toISOString();
        attrs['updated_at'] = new Date().toISOString();
      }
      isExists = true;
      original = { ...attrs };
      return true;
    },

    // remove in production - use delete pattern
    // eslint-disable-next-line @typescript-eslint/require-await
    async delete(): Promise<boolean> {
      if (!isExists || db === undefined) return false;
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

/**
 * Find a model by ID
 */
export const find = async (config: ModelConfig, id: unknown): Promise<IModel | null> => {
  const builder = query(config.table, config.connection);
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
  const builder = query(config.table, config.connection);
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

type DefinedModel<T extends BoundModelMethods> = {
  create: (attributes?: Record<string, unknown>) => IModel & T;
  find: (id: unknown) => Promise<(IModel & T) | null>;
  all: () => Promise<Array<IModel & T>>;
  query: () => IQueryBuilder;
  getTable: () => string;
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
      : bindUnboundMethods(model, (methodsOrPlan as UnboundModelMethods | undefined) ?? {});
    return extendModel(model, methods);
  };

  return {
    create: (attributes: Record<string, unknown> = {}): IModel & BoundModelMethods =>
      attach(createModel(config, attributes)),
    find: async (id: unknown): Promise<(IModel & BoundModelMethods) | null> => {
      const model = await find(config, id);
      return model === null ? null : attach(model);
    },
    all: async (): Promise<Array<IModel & BoundModelMethods>> => {
      const models = await all(config);
      return models.map((m) => attach(m));
    },
    query: (): IQueryBuilder => query(config.table, config.connection),
    getTable: (): string => config.table,
  };
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
