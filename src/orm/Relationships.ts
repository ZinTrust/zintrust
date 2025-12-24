/**
 * Relationship Types
 * Define how models relate to each other
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { IModel, Model, ModelStatic } from '@orm/Model';

export type RelationshipType = 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';

export interface Relation {
  type: RelationshipType;
  related: typeof Model;
  foreignKey: string;
  localKey: string;
  throughTable?: string;
}

export interface IRelationship {
  get(instance: IModel): Promise<unknown>;
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
