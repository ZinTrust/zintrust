/**
 * Relationship Types
 * Define how models relate to each other
 */

import { Model } from '@orm/Model';

export type RelationshipType = 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';

export interface Relation {
  type: RelationshipType;
  related: typeof Model;
  foreignKey: string;
  localKey: string;
  throughTable?: string;
}

/**
 * Base Relationship class to avoid code duplication
 */
abstract class BaseRelation {
  protected readonly relatedModel: typeof Model;
  protected readonly foreignKey: string;
  protected readonly localKey: string;

  constructor(relatedModel: typeof Model, foreignKey: string, localKey: string) {
    this.relatedModel = relatedModel;
    this.foreignKey = foreignKey;
    this.localKey = localKey;
  }
}

/**
 * Relationship Builder
 */
export class HasOne extends BaseRelation {
  /**
   * Get related model instance
   */
  public async get(instance: Model): Promise<Model | null> {
    const value = instance.getAttribute(this.localKey);
    if (value === undefined || value === null || value === '') return null;

    const related = (await this.relatedModel
      .query()
      .where(this.foreignKey, '=', value)
      .first()) as Model | null;

    return related ?? null;
  }
}

export class HasMany extends BaseRelation {
  /**
   * Get related model instances
   */
  public async get(instance: Model): Promise<Model[]> {
    const value = instance.getAttribute(this.localKey);
    if (value === undefined || value === null || value === '') return [];

    const related = (await this.relatedModel
      .query()
      .where(this.foreignKey, '=', value)
      .get()) as Model[];

    return related;
  }
}

export class BelongsTo extends BaseRelation {
  /**
   * Get related model instance
   */
  public async get(instance: Model): Promise<Model | null> {
    const value = instance.getAttribute(this.foreignKey);
    if (value === undefined || value === null || value === '') return null;

    const related = (await this.relatedModel
      .query()
      .where(this.localKey, '=', value)
      .first()) as Model | null;

    return related ?? null;
  }
}

export class BelongsToMany {
  private readonly relatedModel: typeof Model;
  private readonly _throughTable: string;
  private readonly _foreignKey: string;
  private readonly _relatedKey: string;

  constructor(
    relatedModel: typeof Model,
    throughTable: string,
    foreignKey: string,
    relatedKey: string
  ) {
    this.relatedModel = relatedModel;
    this._throughTable = throughTable;
    this._foreignKey = foreignKey;
    this._relatedKey = relatedKey;
  }

  /**
   * Get related model instances through pivot table
   */
  public async get(instance: Model): Promise<Model[]> {
    const instanceId = instance.getAttribute('id');
    if (
      instanceId === undefined ||
      instanceId === null ||
      instanceId === '' ||
      this._throughTable === '' ||
      this._foreignKey === '' ||
      this._relatedKey === ''
    ) {
      return [];
    }

    const relatedTable = new (this.relatedModel as unknown as new () => Model)().getTable();

    const related = (await this.relatedModel
      .query()
      .join(this._throughTable, `${relatedTable}.id = ${this._throughTable}.${this._relatedKey}`)
      .where(`${this._throughTable}.${this._foreignKey}`, instanceId as string)
      .get()) as Model[];

    return related;
  }
}
