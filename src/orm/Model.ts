/**
 * Enhanced Model with Relationships
 * Full ORM capabilities with eager/lazy loading
 */

import { generateUuid } from '@common/utility';
import { DEFAULTS } from '@config/constants';
import { Logger } from '@config/logger';
import type { Paginator } from '@database/Paginator';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isFunction, isMissingLike, isObject, isWhitespaceOnly } from '@helper/index';
import { useDatabase, type IDatabase } from '@orm/Database';
import type {
  EagerLoadConstraints,
  IQueryBuilder,
  InsertResult,
  NormalizedTextOptions,
  PaginationOptions,
  QueryBuilderOptions,
} from '@orm/QueryBuilder';
import { QueryBuilder } from '@orm/QueryBuilder';
import {
  RelationBootstrapDiagnostics,
  type RelationBootstrapFailure,
} from '@orm/RelationBootstrapDiagnostics';
import type { IRelationship } from '@orm/Relationships';
import {
  BelongsTo,
  BelongsToMany,
  HasMany,
  HasManyThrough,
  HasOne,
  HasOneThrough,
  MorphMany,
  MorphOne,
  MorphTo,
} from '@orm/Relationships';

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
  timestamps?: boolean;
  casts?: Record<string, string>;
  softDeletes?: boolean;
  deleteAtColumn?: string;
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
  primaryKey?: {
    key?: string;
    strategy?: 'uuid';
  };
}

type ModelObserver = NonNullable<ModelConfig['observers']>[number];

export type PrimaryKeyObserverOptions = {
  key?: string;
  whenMissing?: boolean;
  generate: () => unknown;
};

export interface ModelStatic {
  query(): IQueryBuilder;
  getTable?(): string;
  name?: string;
  hydrate?(attributes: Record<string, unknown> | IModel): IModel;
}

export interface IModel {
  fill(attributes: Record<string, unknown>): IModel;
  setAttribute(key: string, value: unknown): IModel;
  getAttribute(key: string): unknown;
  getAttributes(): Record<string, unknown>;
  save(): Promise<boolean>;
  delete(): Promise<boolean>;
  restore(): Promise<boolean>;
  forceDelete(): Promise<boolean>;
  isDeleted(): boolean;
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
  morphOne(
    relatedModel: ModelStatic,
    morphName: string,
    morphType?: string,
    morphId?: string,
    localKey?: string
  ): IRelationship;
  morphMany(
    relatedModel: ModelStatic,
    morphName: string,
    morphType?: string,
    morphId?: string,
    localKey?: string
  ): IRelationship;
  morphTo(
    morphName: string,
    morphMap: Record<string, ModelStatic>,
    morphType?: string,
    morphId?: string
  ): IRelationship;
  hasOneThrough(
    relatedModel: ModelStatic,
    through: ModelStatic,
    foreignKey?: string,
    throughForeignKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): IRelationship;
  hasManyThrough(
    relatedModel: ModelStatic,
    through: ModelStatic,
    foreignKey?: string,
    throughForeignKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): IRelationship;
}

const isHydratedModelInstance = (value: unknown): value is IModel => {
  if (!isObject(value)) return false;

  return (
    isFunction(value['getAttribute']) &&
    isFunction(value['setAttribute']) &&
    isFunction(value['getAttributes']) &&
    isFunction(value['save']) &&
    isFunction(value['exists'])
  );
};

/**
 * Cast attribute value based on config
 */
const castAttribute = (config: ModelConfig, key: string, value: unknown): unknown => {
  const castType = config.casts ? config.casts[key] : undefined;
  if (castType === undefined) return value;

  switch (castType) {
    case 'boolean':
      return value === true || value === 1 || value === '1';
    case 'integer':
      return Number.parseInt(String(value), 10);
    case 'bigint': {
      // Native BigInt if supported, otherwise string
      try {
        return BigInt(value as string | number | boolean);
      } catch {
        return String(value);
      }
    }
    case 'uuid':
      return String(value);
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

type AttributeAssignmentOptions = {
  applyMutators: boolean;
  respectFillable: boolean;
};

const assignAttributes = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  newAttrs: Record<string, unknown>,
  options: AttributeAssignmentOptions
): void => {
  for (const [key, value] of Object.entries(newAttrs)) {
    if (options.respectFillable && config.fillable.length > 0 && !config.fillable.includes(key)) {
      continue;
    }

    const nextValue = options.applyMutators
      ? (config.mutators?.[key]?.(value, attrs) ?? value)
      : value;
    attrs[key] = castAttribute(config, key, nextValue);
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
  assignAttributes(config, attrs, newAttrs, { applyMutators: true, respectFillable: true });
};

const hydrateAttributes = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  storedAttrs: Record<string, unknown>
): void => {
  assignAttributes(config, attrs, storedAttrs, { applyMutators: false, respectFillable: false });
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

  // Run "before" hooks sequentially to ensure safety and consistent state changes.
  // This allows observers to modify the model or throw errors to cancel the operation.
  const isBeforeHook = ['saving', 'creating', 'updating', 'deleting'].includes(hook);

  if (isBeforeHook) {
    for (const observer of observers) {
      const fn = observer[hook];
      if (typeof fn === 'function') {
        // eslint-disable-next-line no-await-in-loop
        await fn(model);
      }
    }
    return;
  }

  // Run "after" hooks in parallel for better performance.
  // These are typically side effects (logging, notifications) that don't depend on each other.
  await Promise.all(
    observers.map(async (observer) => {
      const fn = observer[hook];
      return typeof fn === 'function' ? Promise.resolve(fn(model)) : Promise.resolve();
    })
  );
};

const createModelJSON = (
  config: ModelConfig,
  attrs: Record<string, unknown>
): Record<string, unknown> => {
  const json: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (config.hidden.includes(key)) continue;
    // Serialize BigInt as string to keep JSON stable
    if (typeof value === 'bigint') {
      json[key] = String(value);
      continue;
    }
    // Convert Dates to ISO strings for JSON
    if (value instanceof Date) {
      json[key] = value.toISOString();
      continue;
    }
    json[key] = value;
  }
  return json;
};

const createHasOneFactory =
  (config: ModelConfig) =>
  (relatedModel: ModelStatic, foreignKey?: string): IRelationship =>
    HasOne.create(relatedModel, foreignKey ?? `${config.table.slice(0, -1)}_id`, 'id');

const createHasManyFactory =
  (config: ModelConfig) =>
  (relatedModel: ModelStatic, foreignKey?: string): IRelationship =>
    HasMany.create(relatedModel, foreignKey ?? `${config.table.slice(0, -1)}_id`, 'id');

const createBelongsToFactory =
  () =>
  (relatedModel: ModelStatic, foreignKey?: string): IRelationship => {
    const relatedTable = getRelatedTableName(relatedModel);
    return BelongsTo.create(relatedModel, foreignKey ?? `${relatedTable.slice(0, -1)}_id`, 'id');
  };

const createBelongsToManyFactory =
  (config: ModelConfig) =>
  (
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
  };

const createMorphOneFactory =
  () =>
  (
    relatedModel: ModelStatic,
    morphName: string,
    morphType?: string,
    morphId?: string,
    localKey?: string
  ): IRelationship =>
    MorphOne.create(relatedModel, morphName, morphType, morphId, localKey);

const createMorphManyFactory =
  () =>
  (
    relatedModel: ModelStatic,
    morphName: string,
    morphType?: string,
    morphId?: string,
    localKey?: string
  ): IRelationship =>
    MorphMany.create(relatedModel, morphName, morphType, morphId, localKey);

const createMorphToFactory =
  () =>
  (
    morphName: string,
    morphMap: Record<string, ModelStatic>,
    morphType?: string,
    morphId?: string
  ): IRelationship =>
    MorphTo.create(morphName, morphMap, morphType, morphId);

const createHasOneThroughFactory =
  () =>
  (
    relatedModel: ModelStatic,
    through: ModelStatic,
    foreignKey?: string,
    throughForeignKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): IRelationship =>
    HasOneThrough.create(
      relatedModel,
      through,
      foreignKey,
      throughForeignKey,
      localKey,
      secondLocalKey
    );

const createHasManyThroughFactory =
  () =>
  (
    relatedModel: ModelStatic,
    through: ModelStatic,
    foreignKey?: string,
    throughForeignKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): IRelationship =>
    HasManyThrough.create(
      relatedModel,
      through,
      foreignKey,
      throughForeignKey,
      localKey,
      secondLocalKey
    );

const createModelRelationships = (
  config: ModelConfig
): Pick<
  IModel,
  | 'hasOne'
  | 'hasMany'
  | 'belongsTo'
  | 'belongsToMany'
  | 'morphOne'
  | 'morphMany'
  | 'morphTo'
  | 'hasOneThrough'
  | 'hasManyThrough'
> => {
  return {
    hasOne: createHasOneFactory(config),
    hasMany: createHasManyFactory(config),
    belongsTo: createBelongsToFactory(),
    belongsToMany: createBelongsToManyFactory(config),
    morphOne: createMorphOneFactory(),
    morphMany: createMorphManyFactory(),
    morphTo: createMorphToFactory(),
    hasOneThrough: createHasOneThroughFactory(),
    hasManyThrough: createHasManyThroughFactory(),
  };
};

const applySaveTimestamps = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  isCreate: boolean
): void => {
  if ((config.timestamps ?? false) === false) return;

  const now = new Date().toISOString();
  attrs['updated_at'] = now;
  if (isCreate) {
    attrs['created_at'] = attrs['created_at'] ?? now;
  }
};

type GlobalTraceModelState = {
  __zintrust_trace_model_emit__?: (
    action: 'create' | 'update' | 'delete',
    model: string,
    id?: string | number,
    changes?: Record<string, unknown>
  ) => void;
};

const buildTraceModelChanges = (
  attrs: Record<string, unknown>,
  dirtyFields: string[]
): Record<string, unknown> | undefined => {
  if (dirtyFields.length === 0) return undefined;

  const changes: Record<string, unknown> = {};
  for (const field of dirtyFields) {
    changes[field] = attrs[field];
  }

  return changes;
};

const emitTraceModelEvent = (
  action: 'create' | 'update' | 'delete',
  config: ModelConfig,
  attrs: Record<string, unknown>,
  dirtyFields: string[] = []
): void => {
  const emit = (globalThis as unknown as GlobalTraceModelState).__zintrust_trace_model_emit__;
  if (typeof emit !== 'function') return;

  try {
    const id = attrs['id'];
    emit(
      action,
      config.table,
      typeof id === 'string' || typeof id === 'number' ? id : undefined,
      buildTraceModelChanges(attrs, dirtyFields)
    );
  } catch {
    // best-effort trace emission must not affect ORM operations
  }
};

const isMissingPrimaryKeyValue = (value: unknown): boolean => {
  if (isMissingLike(value)) return true;
  return typeof value === 'string' && (value.length === 0 || isWhitespaceOnly(value));
};

const createPrimaryKeyObserver = (options: PrimaryKeyObserverOptions): ModelObserver => {
  const key = options.key ?? 'id';
  const whenMissing = options.whenMissing ?? true;

  return Object.freeze({
    creating(model: IModel): void {
      if (!whenMissing) return;

      const currentValue = model.getAttribute(key);
      if (!isMissingPrimaryKeyValue(currentValue)) return;

      const nextValue = options.generate();
      if (isMissingPrimaryKeyValue(nextValue)) {
        throw ErrorFactory.createValidationError(
          `Generated primary key for ${key} is missing or blank`
        );
      }

      model.setAttribute(key, nextValue);
    },
  });
};

const ModelPrimaryKey = Object.freeze({
  isMissing: isMissingPrimaryKeyValue,
  using: (options: PrimaryKeyObserverOptions): ModelObserver => createPrimaryKeyObserver(options),
  uuid: (key: string = 'id'): ModelObserver =>
    createPrimaryKeyObserver({ key, whenMissing: true, generate: generateUuid }),
});

const buildPrimaryKeyObservers = (config: ModelConfig): ModelObserver[] => {
  if (config.primaryKey?.strategy !== 'uuid') {
    return [];
  }

  return [ModelPrimaryKey.uuid(config.primaryKey.key ?? 'id')];
};

const normalizeModelConfig = (config: ModelConfig): ModelConfig => {
  const generatedObservers = buildPrimaryKeyObservers(config);
  if (generatedObservers.length === 0) {
    return config;
  }

  return {
    ...config,
    observers: [...generatedObservers, ...(config.observers ?? [])],
  };
};

const persistNewModel = async (
  config: ModelConfig,
  db: IDatabase,
  attrs: Record<string, unknown>
): Promise<void> => {
  const builder = QueryBuilder.create(config.table, db, buildSoftDeleteOptions(config));
  const result = await builder.insert({ ...attrs });

  if (attrs['id'] === undefined && result.id !== null) {
    attrs['id'] = result.id;
  }
};

const collectDirtyValues = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  dirtyFields: string[]
): Record<string, unknown> => {
  const keys = new Set(dirtyFields);
  if (config.timestamps ?? false) {
    keys.add('updated_at');
  }

  return Object.fromEntries(
    [...keys].filter((key) => key in attrs).map((key) => [key, attrs[key]])
  );
};

const persistExistingModel = async (
  config: ModelConfig,
  db: IDatabase,
  attrs: Record<string, unknown>,
  dirtyFields: string[]
): Promise<void> => {
  const values = collectDirtyValues(config, attrs, dirtyFields);
  if (Object.keys(values).length === 0) return;

  const primaryKey = attrs['id'];
  if (primaryKey === undefined || primaryKey === null || primaryKey === '') {
    throw ErrorFactory.createDatabaseError('Cannot update a persisted model without an id');
  }

  const builder = QueryBuilder.create(config.table, db, buildSoftDeleteOptions(config));
  await builder.where('id', '=', primaryKey).update(values);
};

const persistModelState = async (
  config: ModelConfig,
  db: IDatabase,
  attrs: Record<string, unknown>,
  isCreate: boolean,
  dirtyFields: string[]
): Promise<void> => {
  if (isCreate) {
    await persistNewModel(config, db, attrs);
    return;
  }

  await persistExistingModel(config, db, attrs, dirtyFields);
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
    getDirtyFields: () => string[];
  }
): Promise<boolean> => {
  const db = getDb();
  if (db === undefined) throw ErrorFactory.createDatabaseError('Database not initialized');

  const isCreate = context.isExists === false;
  const dirtyFields = context.getDirtyFields();
  await runObservers(config, 'saving', model);
  await runObservers(config, isCreate ? 'creating' : 'updating', model);

  applySaveTimestamps(config, attrs, isCreate);
  await persistModelState(config, db, attrs, isCreate, dirtyFields);
  emitTraceModelEvent(isCreate ? 'create' : 'update', config, attrs, dirtyFields);

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
  emitTraceModelEvent('delete', config, model.getAttributes());
  await runObservers(config, 'deleted', model);
  return true;
};

type AttributeApiContext = {
  dirtyFields: Set<string>;
  getModel: () => IModel;
  getOriginal: () => Record<string, unknown>;
  exists: () => boolean;
  setExists: (exists: boolean) => void;
  syncReadableProperty: (key: string) => void;
};

type LifecycleApiContext = {
  dirtyFields: Set<string>;
  getModel: () => IModel;
  exists: () => boolean;
  setExists: (value: boolean) => void;
  setOriginal: (value: Record<string, unknown>) => void;
};

const createAttributeApi = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  relations: Record<string, unknown>,
  context: AttributeApiContext
): Pick<
  IModel,
  | 'fill'
  | 'setAttribute'
  | 'getAttribute'
  | 'getAttributes'
  | 'setRelation'
  | 'getRelation'
  | 'toJSON'
  | 'isDirty'
  | 'getTable'
  | 'exists'
  | 'setExists'
> => ({
  fill: (newAttrs: Record<string, unknown>): IModel => {
    fillAttributes(config, attrs, newAttrs);
    const original = context.getOriginal();
    for (const key of Object.keys(newAttrs)) {
      context.syncReadableProperty(key);
      if (attrs[key] !== original[key]) {
        context.dirtyFields.add(key);
      }
    }
    return context.getModel();
  },
  setAttribute: (key: string, value: unknown): IModel => {
    const mutator = config.mutators?.[key];
    const nextValue = mutator ? mutator(value, attrs) : value;
    const castedValue = castAttribute(config, key, nextValue);
    attrs[key] = castedValue;
    context.syncReadableProperty(key);

    const original = context.getOriginal();
    if (original[key] === castedValue) {
      context.dirtyFields.delete(key);
    } else {
      context.dirtyFields.add(key);
    }

    return context.getModel();
  },
  getAttribute: (key: string): unknown => {
    if (relations[key] !== undefined) return relations[key];
    return applyAccessor(config, key, attrs);
  },
  getAttributes: (): Record<string, unknown> => ({ ...attrs }),
  setRelation: (name: string, value: unknown): void => {
    relations[name] = value;
    context.syncReadableProperty(name);
  },
  getRelation: <T>(name: string): T | undefined => relations[name] as T,
  toJSON: (): Record<string, unknown> => createModelJSON(config, attrs),
  isDirty: (key?: string): boolean => {
    if (key !== undefined) return context.dirtyFields.has(key);
    return context.dirtyFields.size > 0;
  },
  getTable: (): string => config.table,
  exists: (): boolean => context.exists(),
  setExists: (nextExists: boolean): void => {
    context.setExists(nextExists);
  },
});

const createLifecycleApi = (
  config: ModelConfig,
  attrs: Record<string, unknown>,
  getDb: () => IDatabase,
  context: LifecycleApiContext
): Pick<IModel, 'save' | 'delete' | 'restore' | 'forceDelete' | 'isDeleted'> => ({
  save: async (): Promise<boolean> =>
    performModelSave(context.getModel(), config, attrs, getDb, {
      isExists: context.exists(),
      setExists: context.setExists,
      updateOriginal: context.setOriginal,
      clearDirty: () => context.dirtyFields.clear(),
      getDirtyFields: () => [...context.dirtyFields],
    }),
  delete: async (): Promise<boolean> =>
    performModelDelete(context.getModel(), config, getDb, context.exists()),
  restore: async (): Promise<boolean> => {
    if (config.softDeletes !== true || !context.exists()) return false;
    await Promise.resolve();
    const deleteAtColumn = config.deleteAtColumn ?? 'deleted_at';
    attrs[deleteAtColumn] = null;
    context.dirtyFields.add(deleteAtColumn);
    return true;
  },
  forceDelete: async (): Promise<boolean> => {
    if (!context.exists()) return false;
    const model = context.getModel();
    await runObservers(config, 'deleting', model);
    emitTraceModelEvent('delete', config, attrs);
    await runObservers(config, 'deleted', model);
    return true;
  },
  isDeleted: (): boolean => {
    if (config.softDeletes !== true) return false;
    const deleteAtColumn = config.deleteAtColumn ?? 'deleted_at';
    const deletedValue = attrs[deleteAtColumn];
    return deletedValue !== null && deletedValue !== undefined;
  },
});

const defineReadableProperty = (
  model: IModel,
  config: ModelConfig,
  attrs: Record<string, unknown>,
  relations: Record<string, unknown>,
  key: string
): void => {
  if (key.length === 0 || key in model) {
    return;
  }

  Object.defineProperty(model, key, {
    configurable: true,
    enumerable: true,
    get: (): unknown => {
      if (relations[key] !== undefined) {
        return relations[key];
      }

      return applyAccessor(config, key, attrs);
    },
    set: (value: unknown): void => {
      if (relations[key] !== undefined) {
        relations[key] = value;
        return;
      }

      model.setAttribute(key, value);
    },
  });
};

/**
 * Create a new model instance
 */
export const createModel = (
  config: ModelConfig,
  attributes: Record<string, unknown> = {},
  options?: { hydrate?: boolean; exists?: boolean }
): IModel => {
  const connection = config.connection ?? DEFAULTS.CONNECTION;
  const getDb = (): IDatabase => useDatabase(undefined, connection);

  const attrs: Record<string, unknown> = {};
  const relations: Record<string, unknown> = {}; // Store eager loaded relations
  let original: Record<string, unknown> = {};
  let isExists = options?.exists === true;
  const dirtyFields = new Set<string>();

  if (options?.hydrate === true) {
    hydrateAttributes(config, attrs, attributes);
  } else {
    fillAttributes(config, attrs, attributes);
  }
  original = { ...attrs };

  let modelApi = {} as IModel;
  const syncReadableProperty = (key: string): void => {
    if (key in attrs || key in relations) {
      defineReadableProperty(modelApi, config, attrs, relations, key);
    }
  };

  modelApi = {
    ...createAttributeApi(config, attrs, relations, {
      dirtyFields,
      getModel: () => modelApi,
      getOriginal: () => original,
      exists: () => isExists,
      setExists: (exists) => {
        isExists = exists;
      },
      syncReadableProperty,
    }),
    ...createLifecycleApi(config, attrs, getDb, {
      dirtyFields,
      getModel: () => modelApi,
      exists: () => isExists,
      setExists: (exists) => {
        isExists = exists;
      },
      setOriginal: (value) => {
        original = value;
      },
    }),
  } as IModel;

  Object.assign(modelApi, createModelRelationships(config));
  Object.keys(attrs).forEach(syncReadableProperty);

  return modelApi;
};

const createPersistedModel = async (
  config: ModelConfig,
  attributes: Record<string, unknown> = {}
): Promise<IModel> => {
  const model = createModel(config, attributes);
  await model.save();
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

  return createModel(config, result as Record<string, unknown>, { hydrate: true, exists: true });
};

/**
 * Get all records for a model
 */
export const all = async (config: ModelConfig): Promise<IModel[]> => {
  const db = useDatabase(undefined, config.connection ?? DEFAULTS.CONNECTION);
  const builder = QueryBuilder.create(config.table, db, buildSoftDeleteOptions(config));
  const results = await builder.get();
  return results.map((result) =>
    createModel(config, result as Record<string, unknown>, { hydrate: true, exists: true })
  );
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
  const extended = Object.create(model as object) as Record<string, unknown>;
  for (const [name, method] of Object.entries(methods)) {
    extended[name] = method;
  }
  return extended as IModel & T;
};

export type DefinedModel<T extends BoundModelMethods> = {
  create: (attributes?: Record<string, unknown> | undefined) => Promise<IModel & T>;
  make: (attributes?: Record<string, unknown> | undefined) => IModel & T;
  new: (attributes?: Record<string, unknown> | undefined) => IModel & T;
  hydrate: (attributes: Record<string, unknown> | (IModel & T)) => IModel & T;
  hydrateWithRelations(
    attributes: Record<string, unknown>,
    related: Record<string, unknown>
  ): IModel & T;
  find: (id: unknown) => Promise<(IModel & T) | null>;
  all: () => Promise<Array<IModel & T>>;
  raw: () => Promise<Array<Record<string, unknown>>>;
  query: () => IQueryBuilder;
  paginate: (
    page: number,
    perPage: number,
    options?: PaginationOptions
  ) => Promise<Paginator<IModel & T>>;

  // QueryBuilder convenience methods
  where: (
    column: string,
    operator: string | number | boolean | null,
    value?: unknown
  ) => IQueryBuilder;
  andWhere: (column: string, operator: string, value?: unknown) => IQueryBuilder;
  orWhere: (column: string, operator: string, value?: unknown) => IQueryBuilder;
  whereGroup: (callback: (builder: IQueryBuilder) => unknown) => IQueryBuilder;
  orWhereGroup: (callback: (builder: IQueryBuilder) => unknown) => IQueryBuilder;
  whereNormalized: (
    column: string,
    value: unknown,
    options?: NormalizedTextOptions
  ) => IQueryBuilder;
  orWhereNormalized: (
    column: string,
    value: unknown,
    options?: NormalizedTextOptions
  ) => IQueryBuilder;
  whereIn: (column: string, values: unknown[]) => IQueryBuilder;
  whereNotIn: (column: string, values: unknown[]) => IQueryBuilder;
  select: (...columns: string[]) => IQueryBuilder;
  selectAs: (column: string, alias: string) => IQueryBuilder;
  max: (column: string, alias?: string) => IQueryBuilder;
  join: (table: string, on: string) => IQueryBuilder;
  leftJoin: (table: string, on: string) => IQueryBuilder;
  orderBy: (column: string, direction?: 'ASC' | 'DESC') => IQueryBuilder;
  inRandomOrder: () => IQueryBuilder;
  limit: (count: number) => IQueryBuilder;
  offset: (count: number) => IQueryBuilder;
  withTrashed: () => IQueryBuilder;
  onlyTrashed: () => IQueryBuilder;
  withoutTrashed: () => IQueryBuilder;

  scope: (name: string, ...args: unknown[]) => IQueryBuilder;
  with: (relations: string | string[] | EagerLoadConstraints) => IQueryBuilder;
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
  return (
    attributes: Record<string, unknown> | (IModel & BoundModelMethods)
  ): IModel & BoundModelMethods => {
    if (isHydratedModelInstance(attributes)) {
      return attributes;
    }

    const model = createModel(cfg, attributes, { hydrate: true, exists: true });
    return attach(model);
  };
};

type RelationProbeOutcome =
  | { kind: 'relationship'; relation: IRelationship }
  | { kind: 'failure'; failure: RelationBootstrapFailure }
  | { kind: 'ignored' };

const createRelationBootstrapContext = (
  cfg: ModelConfig,
  relationName: string
): RelationBootstrapFailure['modelTable'] extends string
  ? { modelTable: string; relationName: string }
  : never => ({
  modelTable: cfg.table,
  relationName,
});

const logRelationBootstrapProbe = (
  debugRelationBootstrap: boolean,
  table: string,
  relationName: string
): void => {
  if (debugRelationBootstrap) {
    Logger.info(`[ORM] Relation bootstrap probing ${table}.${relationName}`);
  }
};

const logRelationBootstrapResolved = (
  debugRelationBootstrap: boolean,
  table: string,
  relationName: string
): void => {
  if (debugRelationBootstrap) {
    Logger.info(`[ORM] Relation bootstrap resolved relationship ${table}.${relationName}`);
  }
};

const logRelationBootstrapIgnored = (
  debugRelationBootstrap: boolean,
  table: string,
  relationName: string
): void => {
  if (debugRelationBootstrap) {
    Logger.info(`[ORM] Relation bootstrap ignored non-relationship ${table}.${relationName}`);
  }
};

const logRelationBootstrapThrown = (
  debugRelationBootstrap: boolean,
  table: string,
  relationName: string,
  error: unknown
): void => {
  if (debugRelationBootstrap) {
    Logger.warn(`[ORM] Relation bootstrap probe threw for ${table}.${relationName}`, error);
  }
};

const processRelationProbe = (
  cfg: ModelConfig,
  relationName: string,
  fn: AnyFunction,
  debugRelationBootstrap: boolean
): RelationProbeOutcome => {
  const relationContext = createRelationBootstrapContext(cfg, relationName);

  try {
    logRelationBootstrapProbe(debugRelationBootstrap, cfg.table, relationName);

    const result = RelationBootstrapDiagnostics.withContext(relationContext, () => fn());

    if (!isRelationship(result)) {
      logRelationBootstrapIgnored(debugRelationBootstrap, cfg.table, relationName);
      return { kind: 'ignored' };
    }

    logRelationBootstrapResolved(debugRelationBootstrap, cfg.table, relationName);
    return { kind: 'relationship', relation: result };
  } catch (error) {
    if (RelationBootstrapDiagnostics.isDatabaseRegistrationFailure(error)) {
      return {
        kind: 'failure',
        failure: RelationBootstrapDiagnostics.createFailure(relationContext, error),
      };
    }

    logRelationBootstrapThrown(debugRelationBootstrap, cfg.table, relationName, error);
    return { kind: 'ignored' };
  }
};

const createRelationMapping = (
  cfg: ModelConfig,
  resolveMethods: (model: IModel) => BoundModelMethods
): Record<string, IRelationship> => {
  const dummyModel = createModel(cfg);
  const methods = resolveMethods(dummyModel);
  const debugRelationBootstrap = RelationBootstrapDiagnostics.isDebugEnabled();

  const relationMapping: Record<string, IRelationship> = {};
  const relationBootstrapFailures: RelationBootstrapFailure[] = [];
  for (const [name, fn] of Object.entries(methods) as Array<[string, AnyFunction]>) {
    const outcome = processRelationProbe(cfg, name, fn, debugRelationBootstrap);
    if (outcome.kind === 'relationship') {
      relationMapping[name] = outcome.relation;
      continue;
    }

    if (outcome.kind === 'failure') {
      relationBootstrapFailures.push(outcome.failure);
    }
  }

  if (relationBootstrapFailures.length > 0) {
    Logger.warn(RelationBootstrapDiagnostics.formatFailureSummary(relationBootstrapFailures));
  }

  return relationMapping;
};

const hydrateRows = (
  raw: unknown,
  hydrateModel: (attributes: Record<string, unknown>) => IModel & BoundModelMethods
): Array<IModel & BoundModelMethods> | null => {
  if (!Array.isArray(raw)) return null;
  const rows = raw.filter((element) => isRecord(element));
  return rows.map((element) => hydrateModel(element));
};

const loadEagerRelations = async (
  eagerBuilder: {
    getEagerLoads?: () => string[];
    getEagerLoadConstraints?: () => Record<string, (builder: IQueryBuilder) => IQueryBuilder>;
    load?: (
      models: Array<IModel & BoundModelMethods>,
      relation: string,
      constraint?: (builder: IQueryBuilder) => IQueryBuilder
    ) => Promise<void>;
  },
  models: Array<IModel & BoundModelMethods>
): Promise<void> => {
  const eagerLoads =
    typeof eagerBuilder.getEagerLoads === 'function' ? eagerBuilder.getEagerLoads() : undefined;
  const eagerLoadConstraints =
    typeof eagerBuilder.getEagerLoadConstraints === 'function'
      ? eagerBuilder.getEagerLoadConstraints()
      : undefined;

  if (
    !Array.isArray(eagerLoads) ||
    eagerLoads.length === 0 ||
    typeof eagerBuilder.load !== 'function' ||
    models.length === 0
  ) {
    return;
  }

  await Promise.all(
    eagerLoads.map(async (relation) => {
      const constraint = eagerLoadConstraints?.[relation];
      await eagerBuilder.load?.(models, relation, constraint);
    })
  );
};

const loadEagerCounts = async (
  eagerBuilder: {
    getEagerLoadCounts?: () => string[];
    loadCount?: (models: Array<IModel & BoundModelMethods>, relation: string) => Promise<void>;
  },
  models: Array<IModel & BoundModelMethods>
): Promise<void> => {
  const eagerLoadCounts =
    typeof eagerBuilder.getEagerLoadCounts === 'function'
      ? eagerBuilder.getEagerLoadCounts()
      : undefined;

  if (
    !Array.isArray(eagerLoadCounts) ||
    eagerLoadCounts.length === 0 ||
    typeof eagerBuilder.loadCount !== 'function' ||
    models.length === 0
  ) {
    return;
  }

  await Promise.all(
    eagerLoadCounts.map(async (relation) => eagerBuilder.loadCount?.(models, relation))
  );
};

const hydrateAndLoadRelations = async (
  raw: unknown,
  eagerBuilder: {
    getEagerLoads?: () => string[];
    getEagerLoadConstraints?: () => Record<string, (builder: IQueryBuilder) => IQueryBuilder>;
    getEagerLoadCounts?: () => string[];
    load?: (
      models: Array<IModel & BoundModelMethods>,
      relation: string,
      constraint?: (builder: IQueryBuilder) => IQueryBuilder
    ) => Promise<void>;
    loadCount?: (models: Array<IModel & BoundModelMethods>, relation: string) => Promise<void>;
  },
  hydrateModel: (attributes: Record<string, unknown>) => IModel & BoundModelMethods
): Promise<unknown> => {
  const models = hydrateRows(raw, hydrateModel);
  if (!models) return raw;

  await loadEagerRelations(eagerBuilder, models);
  await loadEagerCounts(eagerBuilder, models);

  return models;
};

const hydrateOneAndLoadRelations = async (
  raw: unknown,
  eagerBuilder: {
    getEagerLoads?: () => string[];
    getEagerLoadConstraints?: () => Record<string, (builder: IQueryBuilder) => IQueryBuilder>;
    getEagerLoadCounts?: () => string[];
    load?: (
      models: Array<IModel & BoundModelMethods>,
      relation: string,
      constraint?: (builder: IQueryBuilder) => IQueryBuilder
    ) => Promise<void>;
    loadCount?: (models: Array<IModel & BoundModelMethods>, relation: string) => Promise<void>;
  },
  hydrateModel: (attributes: Record<string, unknown>) => IModel & BoundModelMethods
): Promise<unknown> => {
  if (!isRecord(raw)) return raw;

  const model = hydrateModel(raw);
  await loadEagerRelations(eagerBuilder, [model]);
  await loadEagerCounts(eagerBuilder, [model]);
  return model;
};

const wrapBuilderGetForEagerLoading = (
  builder: IQueryBuilder,
  hydrateModel: (attributes: Record<string, unknown>) => IModel & BoundModelMethods
): void => {
  const eagerBuilder = builder as unknown as {
    first: () => Promise<unknown>;
    firstOrFail: (message?: string) => Promise<unknown>;
    get: () => Promise<unknown>;
    paginate?: (
      page: number,
      perPage: number,
      options?: PaginationOptions
    ) => Promise<Paginator<unknown>>;
    getEagerLoads?: () => string[];
    getEagerLoadCounts?: () => string[];
    getEagerLoadConstraints?: () => Record<string, (builder: IQueryBuilder) => IQueryBuilder>;
    load?: (
      models: Array<IModel & BoundModelMethods>,
      relation: string,
      constraint?: (builder: IQueryBuilder) => IQueryBuilder
    ) => Promise<void>;
    loadCount?: (models: Array<IModel & BoundModelMethods>, relation: string) => Promise<void>;
  };

  if (typeof eagerBuilder.first === 'function') {
    const originalFirst = eagerBuilder.first.bind(builder);
    eagerBuilder.first = async (): Promise<unknown> => {
      const raw = await originalFirst();
      return hydrateOneAndLoadRelations(raw, eagerBuilder, hydrateModel);
    };
  }

  if (typeof eagerBuilder.firstOrFail === 'function') {
    const originalFirstOrFail = eagerBuilder.firstOrFail.bind(builder);
    eagerBuilder.firstOrFail = async (message?: string): Promise<unknown> => {
      const raw = await originalFirstOrFail(message);
      return hydrateOneAndLoadRelations(raw, eagerBuilder, hydrateModel);
    };
  }

  const originalGet = eagerBuilder.get.bind(builder);
  eagerBuilder.get = async (): Promise<unknown> => {
    const raw = await originalGet();
    return hydrateAndLoadRelations(raw, eagerBuilder, hydrateModel);
  };

  if (typeof eagerBuilder.paginate === 'function') {
    const originalPaginate = eagerBuilder.paginate.bind(builder);
    eagerBuilder.paginate = async (
      page: number,
      perPage: number,
      options?: PaginationOptions
    ): Promise<Paginator<unknown>> => {
      const result = await originalPaginate(page, perPage, options);
      if (!Array.isArray(result.items)) return result;

      const models = await hydrateAndLoadRelations(result.items, eagerBuilder, hydrateModel);
      if (!Array.isArray(models)) return result;

      return {
        ...result,
        items: models,
      };
    };
  }
};

const createQueryBuilderMethods = (
  cfg: ModelConfig,
  hydrateModel: (attributes: Record<string, unknown>) => IModel & BoundModelMethods
): Omit<
  DefinedModel<BoundModelMethods>,
  'create' | 'make' | 'new' | 'hydrate' | 'hydrateWithRelations' | 'find' | 'all' | 'raw' | 'db'
> => {
  const wrappedBuilder = (): IQueryBuilder => {
    const builder = createModelBuilder(cfg);
    wrapBuilderGetForEagerLoading(builder, hydrateModel);
    return builder;
  };

  return {
    query: (): IQueryBuilder => wrappedBuilder(),
    paginate: async (page: number, perPage: number, options?: PaginationOptions) =>
      wrappedBuilder().paginate(page, perPage, options),
    where: (column: string, operator: string | number | boolean | null, value?: unknown) =>
      wrappedBuilder().where(column, operator, value),
    andWhere: (column: string, operator: string, value?: unknown) =>
      wrappedBuilder().andWhere(column, operator, value),
    orWhere: (column: string, operator: string, value?: unknown) =>
      wrappedBuilder().orWhere(column, operator, value),
    whereGroup: (callback: (builder: IQueryBuilder) => unknown) =>
      wrappedBuilder().whereGroup(callback),
    orWhereGroup: (callback: (builder: IQueryBuilder) => unknown) =>
      wrappedBuilder().orWhereGroup(callback),
    whereNormalized: (column: string, value: unknown, options?: NormalizedTextOptions) =>
      wrappedBuilder().whereNormalized(column, value, options),
    orWhereNormalized: (column: string, value: unknown, options?: NormalizedTextOptions) =>
      wrappedBuilder().orWhereNormalized(column, value, options),
    whereIn: (column: string, values: unknown[]) => wrappedBuilder().whereIn(column, values),
    whereNotIn: (column: string, values: unknown[]) => wrappedBuilder().whereNotIn(column, values),
    select: (...columns: string[]) => wrappedBuilder().select(...columns),
    selectAs: (column: string, alias: string) => wrappedBuilder().selectAs(column, alias),
    max: (column: string, alias?: string) => wrappedBuilder().max(column, alias),
    join: (table: string, on: string) => wrappedBuilder().join(table, on),
    leftJoin: (table: string, on: string) => wrappedBuilder().leftJoin(table, on),
    orderBy: (column: string, direction?: 'ASC' | 'DESC') =>
      wrappedBuilder().orderBy(column, direction),
    inRandomOrder: () => wrappedBuilder().inRandomOrder(),
    limit: (count: number) => wrappedBuilder().limit(count),
    offset: (count: number) => wrappedBuilder().offset(count),
    withTrashed: () => wrappedBuilder().withTrashed(),
    onlyTrashed: () => wrappedBuilder().onlyTrashed(),
    withoutTrashed: () => wrappedBuilder().withoutTrashed(),
    scope: (name: string, ...args: unknown[]) => {
      const fn = cfg.scopes?.[name];
      if (typeof fn !== 'function') {
        throw ErrorFactory.createConfigError(`Unknown query scope: ${name}`);
      }
      const builder = createModelBuilder(cfg);
      return fn(builder, ...args);
    },
    with: (relations: string | string[] | EagerLoadConstraints): IQueryBuilder => {
      const builder = wrappedBuilder();
      if (Array.isArray(relations)) {
        relations.forEach((r) => builder.with(r));
        return builder;
      }
      return builder.with(relations);
    },
    getTable: (): string => cfg.table,
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
  const makeModel = (attributes: Record<string, unknown> = {}): IModel & BoundModelMethods =>
    attach(createModel(cfg, attributes));

  return {
    create: async (
      attributes: Record<string, unknown> = {}
    ): Promise<IModel & BoundModelMethods> => {
      const model = makeModel(attributes);
      await model.save();
      return model;
    },
    make: (attributes: Record<string, unknown> = {}): IModel & BoundModelMethods =>
      makeModel(attributes),
    new: (attributes: Record<string, unknown> = {}): IModel & BoundModelMethods =>
      makeModel(attributes),
    hydrate: (
      attributes: Record<string, unknown> | (IModel & BoundModelMethods)
    ): IModel & BoundModelMethods => hydrateModel(attributes),
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
    ...createQueryBuilderMethods(cfg, hydrateModel),
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
          const relatedModels = data.filter((element) => isRecord(element)).map((d) => hydrate(d));
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
export function define(config: ModelConfig): DefinedModel<BoundModelMethods>;
export function define<const T extends UnboundModelMethods>(
  config: ModelConfig,
  methods: T
): DefinedModel<BoundFromUnbound<T>>;
export function define<const T extends BoundModelMethods>(
  config: ModelConfig,
  plan: (model: IModel) => T
): DefinedModel<T>;
export function define<const T extends UnboundModelMethods | BoundModelMethods = BoundModelMethods>(
  config: ModelConfig,
  methodsOrPlan?: T | ((model: IModel) => T)
): DefinedModel<T extends UnboundModelMethods ? BoundFromUnbound<T> : T> {
  const normalizedConfig = normalizeModelConfig(config);
  const plan = typeof methodsOrPlan === 'function' ? methodsOrPlan : undefined;
  const unboundMethods = typeof methodsOrPlan === 'function' ? undefined : methodsOrPlan;

  const resolveMethods = (model: IModel): BoundModelMethods => {
    return plan ? plan(model) : bindUnboundMethods(model, unboundMethods ?? {});
  };

  const attach = (model: IModel): IModel & BoundModelMethods => {
    const methods = resolveMethods(model);
    return extendModel(model, methods);
  };

  return createDefinedModelInternal(
    normalizedConfig,
    methodsOrPlan as MethodsOrPlan,
    attach,
    resolveMethods
  ) as unknown as DefinedModel<T extends UnboundModelMethods ? BoundFromUnbound<T> : T>;
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
  create: createPersistedModel,
  make: createModel,
  new: createModel,
  query,
  find,
  all,
  insert,
  bulkInsert,
  define,
  primaryKey: ModelPrimaryKey,
});
