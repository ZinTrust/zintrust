/**
 * Relationship Types
 * Define how models relate to each other
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IModel, Model, ModelStatic } from '@orm/Model';

export type RelationshipType =
  | 'hasOne'
  | 'hasMany'
  | 'belongsTo'
  | 'belongsToMany'
  | 'morphOne'
  | 'morphMany'
  | 'morphTo'
  | 'hasOneThrough'
  | 'hasManyThrough';

export interface Relation {
  type: RelationshipType;
  related: typeof Model;
  foreignKey: string;
  localKey: string;
  throughTable?: string;
}

export interface IRelationship {
  get(instance: IModel): Promise<unknown>;
  type: RelationshipType;
  related: ModelStatic;
  foreignKey: string;
  localKey: string;
  throughTable?: string;
  relatedKey?: string;
  morphType?: string;
  morphId?: string;
  morphName?: string;
  morphMap?: Record<string, ModelStatic>;
  through?: ModelStatic;
  throughForeignKey?: string;
  throughLocalKey?: string;
  secondLocalKey?: string;
}

const getRelatedTableName = (relatedModel: ModelStatic): string => {
  if (typeof relatedModel.getTable === 'function') {
    return relatedModel.getTable();
  }

  throw ErrorFactory.createConfigError('Related model does not provide a table name');
};

/**
 * HasOne Relationship
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const HasOne = Object.freeze({
  create(relatedModel: ModelStatic, foreignKey: string, localKey: string): IRelationship {
    return {
      type: 'hasOne',
      related: relatedModel,
      foreignKey,
      localKey,
      async get(instance: IModel): Promise<unknown> {
        const value = instance.getAttribute(localKey);
        if (value === undefined || value === null || value === '') return null;

        return relatedModel.query().where(foreignKey, '=', value).first();
      },
    };
  },
});

/**
 * HasMany Relationship
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const HasMany = Object.freeze({
  create(relatedModel: ModelStatic, foreignKey: string, localKey: string): IRelationship {
    return {
      type: 'hasMany',
      related: relatedModel,
      foreignKey,
      localKey,
      async get(instance: IModel): Promise<unknown[]> {
        const value = instance.getAttribute(localKey);
        if (value === undefined || value === null || value === '') return [];

        return relatedModel.query().where(foreignKey, '=', value).get();
      },
    };
  },
});

/**
 * BelongsTo Relationship
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const BelongsTo = Object.freeze({
  create(relatedModel: ModelStatic, foreignKey: string, localKey: string): IRelationship {
    return {
      type: 'belongsTo',
      related: relatedModel,
      foreignKey,
      localKey,
      async get(instance: IModel): Promise<unknown> {
        const value = instance.getAttribute(foreignKey);
        if (value === undefined || value === null || value === '') return null;

        return relatedModel.query().where(localKey, '=', value).first();
      },
    };
  },
});

/**
 * BelongsToMany Relationship
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const BelongsToMany = Object.freeze({
  create(
    relatedModel: ModelStatic,
    throughTable: string,
    foreignKey: string,
    relatedKey: string
  ): IRelationship {
    const isValidInstance = (instance: IModel): boolean => {
      const instanceId = instance.getAttribute('id');
      return (
        instanceId !== undefined &&
        instanceId !== null &&
        instanceId !== '' &&
        throughTable !== '' &&
        foreignKey !== '' &&
        relatedKey !== ''
      );
    };

    return {
      type: 'belongsToMany',
      related: relatedModel,
      throughTable,
      foreignKey,
      relatedKey,
      localKey: 'id',
      async get(instance: IModel): Promise<unknown[]> {
        if (!isValidInstance(instance)) {
          return [];
        }

        const instanceId = instance.getAttribute('id');
        const relatedTable = getRelatedTableName(relatedModel);

        return relatedModel
          .query()
          .join(throughTable, `${relatedTable}.id = ${throughTable}.${relatedKey}`)
          .where(`${throughTable}.${foreignKey}`, instanceId as string)
          .get();
      },
    };
  },
});

/**
 * MorphOne Relationship
 * Polymorphic one-to-one relationship
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const MorphOne = Object.freeze({
  create(
    relatedModel: ModelStatic,
    morphName: string,
    morphType?: string,
    morphId?: string,
    localKeyColumn = 'id'
  ): IRelationship {
    const morphTypeColumn = morphType ?? `${morphName}_type`;
    const morphIdColumn = morphId ?? `${morphName}_id`;

    return {
      type: 'morphOne',
      related: relatedModel,
      foreignKey: morphIdColumn,
      localKey: localKeyColumn,
      morphType: morphTypeColumn,
      morphId: morphIdColumn,
      morphName,
      async get(instance: IModel): Promise<unknown> {
        const value = instance.getAttribute(localKeyColumn);
        if (value === undefined || value === null || value === '') return null;

        const modelName = instance.getTable();

        return relatedModel
          .query()
          .where(morphTypeColumn, '=', modelName)
          .where(morphIdColumn, '=', value)
          .first();
      },
    };
  },
});

/**
 * MorphMany Relationship
 * Polymorphic one-to-many relationship
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const MorphMany = Object.freeze({
  create(
    relatedModel: ModelStatic,
    morphName: string,
    morphType?: string,
    morphId?: string,
    localKeyColumn = 'id'
  ): IRelationship {
    const morphTypeColumn = morphType ?? `${morphName}_type`;
    const morphIdColumn = morphId ?? `${morphName}_id`;

    return {
      type: 'morphMany',
      related: relatedModel,
      foreignKey: morphIdColumn,
      localKey: localKeyColumn,
      morphType: morphTypeColumn,
      morphId: morphIdColumn,
      morphName,
      async get(instance: IModel): Promise<unknown[]> {
        const value = instance.getAttribute(localKeyColumn);
        if (value === undefined || value === null || value === '') return [];

        const modelName = instance.getTable();

        return relatedModel
          .query()
          .where(morphTypeColumn, '=', modelName)
          .where(morphIdColumn, '=', value)
          .get();
      },
    };
  },
});

/**
 * MorphTo Relationship
 * Inverse of polymorphic relationships
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const MorphTo = Object.freeze({
  create(
    morphName: string,
    morphMap: Record<string, ModelStatic>,
    morphType?: string,
    morphId?: string
  ): IRelationship {
    const morphTypeColumn = morphType ?? `${morphName}_type`;
    const morphIdColumn = morphId ?? `${morphName}_id`;

    return {
      type: 'morphTo',
      related: Object.values(morphMap)[0],
      foreignKey: morphIdColumn,
      localKey: 'id',
      morphType: morphTypeColumn,
      morphId: morphIdColumn,
      morphName,
      morphMap,
      async get(instance: IModel): Promise<unknown> {
        const type = instance.getAttribute(morphTypeColumn);
        const id = instance.getAttribute(morphIdColumn);

        if (
          type === undefined ||
          type === null ||
          type === '' ||
          id === undefined ||
          id === null ||
          id === ''
        ) {
          return null;
        }

        const relatedModel = morphMap[String(type)];
        if (relatedModel === undefined) {
          throw ErrorFactory.createConfigError(
            `Unknown morph type: ${String(type)}. Available types: ${Object.keys(morphMap).join(', ')}`
          );
        }

        return relatedModel.query().where('id', '=', id).first();
      },
    };
  },
});

/**
 * HasOneThrough Relationship
 * Access a distant relation through an intermediate model
 * Example: Country -> User -> Post (Country hasOneThrough Post through User)
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const HasOneThrough = Object.freeze({
  create(
    relatedModel: ModelStatic,
    through: ModelStatic,
    foreignKey?: string,
    throughForeignKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): IRelationship {
    const throughTable = getRelatedTableName(through);
    const relatedTable = getRelatedTableName(relatedModel);

    // Default keys
    const firstKey = throughForeignKey ?? 'id';
    const secondKey = foreignKey ?? `${throughTable.slice(0, -1)}_id`;
    const localKeyColumn = localKey ?? 'id';
    const secondLocalKeyColumn = secondLocalKey ?? 'id';

    return {
      type: 'hasOneThrough',
      related: relatedModel,
      foreignKey: secondKey,
      localKey: localKeyColumn,
      through,
      throughForeignKey: firstKey,
      secondLocalKey: secondLocalKeyColumn,
      async get(instance: IModel): Promise<unknown> {
        const value = instance.getAttribute(localKeyColumn);
        if (value === undefined || value === null || value === '') return null;

        // Join through intermediate table
        // SELECT related.* FROM related
        // INNER JOIN through ON related.through_id = through.id
        // WHERE through.parent_id = value
        return relatedModel
          .query()
          .join(
            throughTable,
            `${relatedTable}.${secondKey} = ${throughTable}.${secondLocalKeyColumn}`
          )
          .where(`${throughTable}.${firstKey}`, '=', value)
          .first();
      },
    };
  },
});

/**
 * HasManyThrough Relationship
 * Access distant relations through an intermediate model
 * Example: Country -> User -> Post (Country hasManyThrough Posts through Users)
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const HasManyThrough = Object.freeze({
  create(
    relatedModel: ModelStatic,
    through: ModelStatic,
    foreignKey?: string,
    throughForeignKey?: string,
    localKey?: string,
    secondLocalKey?: string
  ): IRelationship {
    const throughTable = getRelatedTableName(through);
    const relatedTable = getRelatedTableName(relatedModel);

    // Default keys
    const firstKey = throughForeignKey ?? 'id';
    const secondKey = foreignKey ?? `${throughTable.slice(0, -1)}_id`;
    const localKeyColumn = localKey ?? 'id';
    const secondLocalKeyColumn = secondLocalKey ?? 'id';

    return {
      type: 'hasManyThrough',
      related: relatedModel,
      foreignKey: secondKey,
      localKey: localKeyColumn,
      through,
      throughForeignKey: firstKey,
      secondLocalKey: secondLocalKeyColumn,
      async get(instance: IModel): Promise<unknown[]> {
        const value = instance.getAttribute(localKeyColumn);
        if (value === undefined || value === null || value === '') return [];

        // Join through intermediate table
        // SELECT related.* FROM related
        // INNER JOIN through ON related.through_id = through.id
        // WHERE through.parent_id = value
        return relatedModel
          .query()
          .join(
            throughTable,
            `${relatedTable}.${secondKey} = ${throughTable}.${secondLocalKeyColumn}`
          )
          .where(`${throughTable}.${firstKey}`, '=', value)
          .get();
      },
    };
  },
});
