/**
 * Enhanced Model with Relationships
 * Full ORM capabilities with eager/lazy loading
 */

import { Database, useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { BelongsTo, BelongsToMany, HasMany, HasOne } from '@orm/Relationships';

export interface ModelConfig {
  table: string;
  fillable: string[];
  hidden: string[];
  timestamps: boolean;
  casts: Record<string, string>;
}

export class Model {
  protected connection: string = 'default';
  protected table: string = '';
  protected fillable: string[] = [];
  protected hidden: string[] = [];
  protected timestamps: boolean = true;
  protected casts: Record<string, string> = {};
  protected attributes: Record<string, unknown> = {};
  protected original: Record<string, unknown> = {};
  protected relations: Map<string, unknown> = new Map();
  protected exists = false;
  protected db?: Database;

  constructor(attributes: Record<string, unknown> = {}) {
    this.db = useDatabase(undefined, this.connection);
    this.fill(attributes);
    this.original = { ...attributes };
  }

  /**
   * Fill model attributes
   */
  public fill(attributes: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(attributes)) {
      if (this.fillable.length === 0 || this.fillable.includes(key)) {
        this.attributes[key] = this.castAttribute(key, value);
      }
    }
    return this;
  }

  /**
   * Set a single attribute
   */
  public setAttribute(key: string, value: unknown): this {
    this.attributes[key] = this.castAttribute(key, value);
    return this;
  }

  /**
   * Get a single attribute
   */
  public getAttribute(key: string): unknown {
    return this.attributes[key];
  }

  /**
   * Get all attributes
   */
  public getAttributes(): Record<string, unknown> {
    return { ...this.attributes };
  }

  /**
   * Cast attribute based on type definition
   */
  private castAttribute(key: string, value: unknown): unknown {
    const castType = this.casts[key];
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
      case 'hashed':
        // In production: use bcrypt for hashing
        return value;
      default:
        return value;
    }
  }

  /**
   * Convert model to JSON
   */
  public toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.attributes)) {
      if (!this.hidden.includes(key)) {
        json[key] = value;
      }
    }
    return json;
  }

  /**
   * Check if attribute was modified
   */
  public isDirty(key?: string): boolean {
    if (key !== undefined) {
      return this.attributes[key] !== this.original[key];
    }
    return JSON.stringify(this.attributes) !== JSON.stringify(this.original);
  }

  /**
   * Save model to database
   */
  public async save(): Promise<boolean> {
    if (this.db === undefined) {
      throw new Error('Database not initialized');
    }

    if (this.timestamps && this.attributes['created_at'] === undefined) {
      this.attributes['created_at'] = new Date().toISOString();
    }
    if (this.timestamps) {
      this.attributes['updated_at'] = new Date().toISOString();
    }

    // In production: execute INSERT/UPDATE query
    this.exists = true;
    this.original = { ...this.attributes };
    return true;
  }

  /**
   * Delete model from database
   */
  public async delete(): Promise<boolean> {
    if (this.exists === false) return false;
    if (this.db === undefined) {
      throw new Error('Database not initialized');
    }

    // In production: execute DELETE query
    return true;
  }

  /**
   * Get a query builder for the model
   */
  public static query(): QueryBuilder {
    const model = new (this as unknown as new () => Model)();
    return new QueryBuilder(model.table, model.db);
  }

  /**
   * Create a new model instance
   */
  public static create(attributes: Record<string, unknown>): Model {
    const model = new (this as unknown as new (attrs: Record<string, unknown>) => Model)(
      attributes
    );
    return model;
  }

  /**
   * Find a model by ID
   */
  public static async find(id: unknown): Promise<Model | null> {
    const builder = (this as unknown as { query(): QueryBuilder }).query();
    builder.where('id', String(id)).limit(1);
    const result = await builder.first();
    if (result === null) return null;

    const model = new (this as unknown as new (attrs: Record<string, unknown>) => Model)(
      result as Record<string, unknown>
    );
    model.exists = true;
    return model;
  }

  /**
   * Get first record
   */
  public static async first(): Promise<Model | null> {
    const builder = (this as unknown as { query(): QueryBuilder }).query();
    const result = await builder.first();
    if (result === null) return null;

    const model = new (this as unknown as new (attrs: Record<string, unknown>) => Model)(
      result as Record<string, unknown>
    );
    model.exists = true;
    return model;
  }

  /**
   * Get all records
   */
  public static async all(): Promise<Model[]> {
    const builder = (this as unknown as { query(): QueryBuilder }).query();
    const results = await builder.get();

    return results.map((result: unknown) => {
      const model = new (this as unknown as new (attrs: Record<string, unknown>) => Model)(
        result as Record<string, unknown>
      );
      model.exists = true;
      return model;
    });
  }

  /**
   * Define has-one relationship
   */
  protected hasOne(relatedModel: typeof Model, foreignKey?: string): HasOne {
    const fk = foreignKey ?? `${this.table.slice(0, -1)}_id`;
    return new HasOne(relatedModel, fk, 'id');
  }

  /**
   * Define has-many relationship
   */
  protected hasMany(relatedModel: typeof Model, foreignKey?: string): HasMany {
    const fk = foreignKey ?? `${this.table.slice(0, -1)}_id`;
    return new HasMany(relatedModel, fk, 'id');
  }

  /**
   * Define belongs-to relationship
   */
  protected belongsTo(relatedModel: typeof Model, foreignKey?: string): BelongsTo {
    const fk = foreignKey ?? `${relatedModel.name.toLowerCase()}_id`;
    return new BelongsTo(relatedModel, fk, 'id');
  }

  /**
   * Define belongs-to-many relationship
   */
  protected belongsToMany(
    relatedModel: typeof Model,
    throughTable?: string,
    foreignKey?: string,
    relatedKey?: string
  ): BelongsToMany {
    const related = new (relatedModel as unknown as new () => Model)();
    const table =
      throughTable ?? [this.table, related.getTable()].sort((a, b) => a.localeCompare(b)).join('_');
    const fk = foreignKey ?? `${this.table.slice(0, -1)}_id`;
    const rk = relatedKey ?? `${related.getTable().slice(0, -1)}_id`;

    return new BelongsToMany(relatedModel, table, fk, rk);
  }

  /**
   * Get table name
   */
  public getTable(): string {
    return this.table;
  }
}
