/**
 * ModelGenerator - Generate ORM model files
 * Creates type-safe model classes with relationships and validation
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

export type FieldType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'text'
  | 'datetime'
  | 'json'
  | '';

export interface ModelField {
  name: string;
  type: FieldType;
  nullable?: boolean;
  default?: unknown;
  unique?: boolean;
  comment?: string;
}

export interface ModelRelationship {
  type: 'hasOne' | 'hasMany' | 'belongsTo';
  model: string;
  foreignKey?: string;
  localKey?: string;
}

export interface ModelOptions {
  name: string; // e.g., "User", "BlogPost"
  modelPath: string; // Path to app/Models/
  table?: string; // e.g., "users", "blog_posts"
  fields?: ModelField[]; // Column definitions
  relationships?: ModelRelationship[];
  timestamps?: boolean; // created_at, updated_at
  fillable?: string[]; // Mass-assignable fields
  hidden?: string[]; // Hidden from JSON
  softDelete?: boolean; // soft_delete column
  withMigration?: boolean; // Generate corresponding migration
  withFactory?: boolean; // Generate factory
  withController?: boolean; // Generate controller
}

export interface ModelGeneratorResult {
  success: boolean;
  modelName: string;
  modelFile: string;
  migrationFile?: string;
  factoryFile?: string;
  controllerFile?: string;
  message: string;
}

/**
 * Validate model options
 */
export function validateOptions(options: ModelOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (/^[A-Z][a-zA-Z0-9]*$/.test(options.name) === false) {
    errors.push(`Invalid model name '${options.name}'. Must start with uppercase letter.`);
  }

  if (options.modelPath === '' || FileGenerator.directoryExists(options.modelPath) === false) {
    errors.push(`Models directory does not exist: ${options.modelPath}`);
  }

  if (options.fields !== undefined && options.fields.length > 0) {
    const invalidFields = options.fields.filter((f) => f.name === '' || f.type === '');
    if (invalidFields.length > 0) {
      errors.push(`Invalid fields: All fields must have name and type`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate model file
 */
export async function generateModel(options: ModelOptions): Promise<ModelGeneratorResult> {
  const validation = validateOptions(options);
  if (validation.valid === false) {
    return {
      success: false,
      modelName: options.name,
      modelFile: '',
      message: `Validation failed: ${validation.errors.join(', ')}`,
    };
  }

  try {
    const modelContent = buildModelCode(options);
    const modelFile = path.join(options.modelPath, `${options.name}.ts`);

    const created = FileGenerator.writeFile(modelFile, modelContent);
    if (created === false) {
      return {
        success: false,
        modelName: options.name,
        modelFile,
        message: `Failed to create model file`,
      };
    }

    Logger.info(`✅ Generated model: ${options.name}`);

    return {
      success: true,
      modelName: options.name,
      modelFile,
      message: `Model ${options.name} created successfully`,
    };
  } catch (error) {
    Logger.error(`Failed to generate model: ${(error as Error).message}`);
    return {
      success: false,
      modelName: options.name,
      modelFile: '',
      message: `Error: ${(error as Error).message}`,
    };
  }
}

/**
 * Build model TypeScript code
 */
function buildModelCode(options: ModelOptions): string {
  const table = options.table ?? toSnakeCase(options.name) + 's';
  const fillable = options.fillable ?? (options.fields ? options.fields.map((f) => f.name) : []);
  const hidden = options.hidden ?? [];

  let code = `/**
 * ${options.name} Model
 * Auto-generated model file
 */

import { Model } from '@orm/Model';

export class ${options.name} extends Model {
  protected table = '${table}';
  protected fillable = [${fillable.map((f) => `'${f}'`).join(', ')}];
  protected hidden = [${hidden.map((f) => `'${f}'`).join(', ')}];
  protected timestamps = ${options.timestamps !== false};
  protected casts = {
`;

  // Add field casts
  code += buildCasts(options.fields);

  code += `
  };

`;

  // Add relationships
  code += buildRelationships(options.relationships);

  // Add soft delete if enabled
  code += buildSoftDelete(options.softDelete);

  code += `}
`;

  return code;
}

/**
 * Build field casts
 */
function buildCasts(fields?: ModelField[]): string {
  if (fields === undefined) return '';

  const casts = fields
    .filter((f) => f.type === 'boolean' || f.type === 'json' || f.type === 'datetime')
    .map((f) => {
      const castType = ((): string => {
        if (f.type === 'boolean') return "'boolean'";
        if (f.type === 'json') return "'json'";
        return "'datetime'";
      })();
      return `    ${f.name}: ${castType},`;
    });

  return casts.join('\n');
}

/**
 * Build relationship methods
 */
function buildRelationships(relationships?: ModelRelationship[]): string {
  if (!relationships || relationships.length === 0) return '';

  let code = '';
  for (const rel of relationships) {
    const foreignKey = rel.foreignKey ?? `${toSnakeCase(rel.model)}_id`;
    const method = toCamelCase(rel.model);

    if (rel.type === 'hasOne') {
      code += `  /**
   * Get associated ${rel.model}
   */
  public async ${method}() {
    return this.hasOne(${rel.model}, '${foreignKey}');
  }

`;
    } else if (rel.type === 'hasMany') {
      const plural = method + 's';
      code += `  /**
   * Get associated ${rel.model} records
   */
  public async ${plural}() {
    return this.hasMany(${rel.model}, '${foreignKey}');
  }

`;
    } else if (rel.type === 'belongsTo') {
      code += `  /**
   * Get parent ${rel.model}
   */
  public async ${method}() {
    return this.belongsTo(${rel.model}, '${foreignKey}');
  }

`;
    }
  }
  return code;
}

/**
 * Build soft delete methods
 */
function buildSoftDelete(softDelete?: boolean): string {
  if (softDelete !== true) return '';

  return `  /**
   * Scope: Active records (not soft deleted)
   */
  public static active() {
    return this.query().whereNull('deleted_at');
  }

  /**
   * Scope: Only soft deleted records
   */
  public static onlyTrashed() {
    return this.query().whereNotNull('deleted_at');
  }

  /**
   * Soft delete this model
   */
  public async softDelete(): Promise<void> {
    this.setAttribute('deleted_at', new Date().toISOString());
    await this.save();
  }

`;
}

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replaceAll(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Convert snake_case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replaceAll(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Get common field types
 */
export function getCommonFieldTypes(): FieldType[] {
  return ['string', 'integer', 'float', 'boolean', 'text', 'datetime', 'json'];
}

/**
 * Generate common model fields (User example)
 */
export function getUserFields(): ModelField[] {
  return [
    { name: 'id', type: 'string', unique: true },
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string', unique: true },
    { name: 'password', type: 'string' },
    { name: 'email_verified_at', type: 'datetime', nullable: true },
    { name: 'remember_token', type: 'string', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ];
}

/**
 * Generate common model fields (Post example)
 */
export function getPostFields(): ModelField[] {
  return [
    { name: 'id', type: 'string', unique: true },
    { name: 'user_id', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'content', type: 'text' },
    { name: 'published_at', type: 'datetime', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ];
}

/**
 * Generate common model fields (Order example)
 */
export function getOrderFields(): ModelField[] {
  return [
    { name: 'id', type: 'string', unique: true },
    { name: 'user_id', type: 'string' },
    { name: 'total', type: 'float' },
    { name: 'status', type: 'string' },
    { name: 'metadata', type: 'json', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ];
}

/**
 * ModelGenerator creates type-safe ORM models
 */
export const ModelGenerator = {
  validateOptions,
  generateModel,
  getCommonFieldTypes,
  getUserFields,
  getPostFields,
  getOrderFields,
};
