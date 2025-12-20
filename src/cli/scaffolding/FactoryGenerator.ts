/**
 * Factory Generator
 * Generates test data factory classes for models
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs/promises';
import path from 'node:path';

export type FieldType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'text'
  | 'datetime'
  | 'json'
  | 'email'
  | 'phone';

export interface FactoryField {
  name: string;
  type: FieldType;
  nullable?: boolean;
}

export interface FactoryOptions {
  factoryName: string;
  modelName: string;
  factoriesPath: string;
  fields?: FactoryField[];
  relationships?: string[];
}

export interface FactoryGeneratorResult {
  success: boolean;
  message: string;
  filePath?: string;
  factoryName?: string;
}

/**
 * Factory Generator - Generates test data factories
 */

/**
 * Validate factory options
 */
export async function validateOptions(options: FactoryOptions): Promise<void> {
  if (options.factoryName === '') {
    throw new Error('Factory name is required');
  }

  if (options.modelName === '') {
    throw new Error('Model name is required');
  }

  if (options.factoriesPath === '') {
    throw new Error('Factories path is required');
  }

  // Validate naming convention (must end with Factory)
  if (!options.factoryName.endsWith('Factory')) {
    throw new Error(`Factory name must end with 'Factory' (e.g., UserFactory, PostFactory)`);
  }

  // Validate path exists
  try {
    await fs.stat(options.factoriesPath);
  } catch (error) {
    Logger.error('Factories path check failed', error);
    throw new Error(`Factories path does not exist: ${options.factoriesPath}`);
  }
}

/**
 * Generate factory
 */
export async function generateFactory(options: FactoryOptions): Promise<FactoryGeneratorResult> {
  try {
    await validateOptions(options);

    const filePath = path.join(options.factoriesPath, `${options.factoryName}.ts`);
    const content = buildFactoryCode(options);

    FileGenerator.writeFile(filePath, content);

    Logger.info(`✅ Created factory: ${options.factoryName}.ts`);

    return {
      success: true,
      message: `Factory ${options.factoryName} created successfully`,
      filePath,
      factoryName: options.factoryName,
    };
  } catch (error) {
    const message = `Failed to generate factory: ${(error as Error).message}`;
    Logger.error(message);
    return {
      success: false,
      message,
    };
  }
}

/**
 * Build factory code
 */
function buildFactoryCode(options: FactoryOptions): string {
  const factoryName = options.factoryName;
  const modelName = options.modelName;
  const fields = options.fields ?? getDefaultFields(modelName);
  const relationships = options.relationships ?? [];

  const importStatements = buildImports(modelName, relationships);
  const fakerFields = buildFakerFields(fields);
  const statePatterns = buildStatePatterns(modelName);
  const relationshipMethods = buildRelationshipMethods(relationships);

  return `${importStatements}

/**
 * ${factoryName}
 * Factory for generating test ${modelName} instances
 */
export class ${factoryName} {
  private data: Record<string, unknown> = {};
  private states: Set<string> = new Set();

  /**
   * Create a new factory instance
   */
  static new(): ${factoryName} {
    return new ${factoryName}();
  }

  /**
   * Create and return instance
   */
  make(): Partial<${modelName}> {
    return {
${fakerFields}
    };
  }

  /**
   * Create multiple instances
   */
  count(n: number): Partial<${modelName}>[] {
    return Array.from({ length: n }, () => this.make());
  }

  /**
   * Set custom data
   */
  data(data: Record<string, unknown>): this {
    this.data = { ...this.data, ...data };
    return this;
  }

  /**
   * Set attribute value
   */
  set(key: string, value: unknown): this {
    this.data[key] = value;
    return this;
  }

  /**
   * Apply state
   */
  state(name: string): this {
    this.states.add(name);
    return this;
  }

  /**
   * Get final data with states applied
   */
  private getData(): Partial<${modelName}> {
    let result = this.make();

    // Apply custom data
    result = { ...result, ...this.data };

    // Apply states
    if (this.states.has('active') === true) {
      result = { ...result, ...this.getActiveState() };
    }

    if (this.states.has('inactive') === true) {
      result = { ...result, ...this.getInactiveState() };
    }

    if (this.states.has('deleted') === true) {
      result = { ...result, ...this.getDeletedState() };
    }

    return result;
  }

${statePatterns}

${relationshipMethods}

  /**
   * Create and return merged result
   */
  create(): Partial<${modelName}> {
    return this.getData();
  }
}
`;
}

/**
 * Build import statements
 */
function buildImports(modelName: string, relationships: string[]): string {
  let imports = `import { faker } from '@faker-js/faker';
import { ${modelName} } from '@app/Models/${modelName}';`;

  if (relationships.length > 0) {
    const relationshipImports = relationships
      .map((rel) => `import { ${rel}Factory } from '@database/factories/${rel}Factory';`)
      .join('\n');
    imports += `\n${relationshipImports}`;
  }

  return imports;
}

/**
 * Build faker field definitions
 */
function buildFakerFields(fields: FactoryField[]): string {
  return fields
    .map((field) => {
      const fakerValue = getFakerValue(field.name, field.type);
      return `      ${field.name}: ${fakerValue},`;
    })
    .join('\n');
}

/**
 * Get faker value for field type
 */
function getFakerValue(fieldName: string, type: FieldType): string {
  // Smart detection based on field name
  const nameBased = getFakerValueByName(fieldName, type);
  if (nameBased !== null) return nameBased;

  // Type-based defaults
  return getFakerValueByType(type);
}

/**
 * Detect faker value based on field name
 */
/**
 * Detect faker value based on field name and type
 */
function getFakerValueByName(fieldName: string, type: FieldType): string | null {
  const name = fieldName.toLowerCase();
  const typeStr = type as string;

  const mappings: Array<{ condition: boolean; value: string }> = [
    { condition: name.includes('email') || typeStr === 'email', value: 'faker.internet.email()' },
    { condition: name.includes('phone') || typeStr === 'phone', value: 'faker.phone.number()' },
    { condition: name.includes('password'), value: 'faker.internet.password()' },
    { condition: name.includes('url') || name.includes('website'), value: 'faker.internet.url()' },
    { condition: name.includes('name'), value: 'faker.person.fullName()' },
    {
      condition: name.includes('title') || name.includes('subject'),
      value: 'faker.lorem.sentence()',
    },
    {
      condition: name.includes('description') || name.includes('content') || typeStr === 'text',
      value: 'faker.lorem.paragraph()',
    },
  ];

  const match = mappings.find((m) => m.condition);
  return match ? match.value : null;
}

/**
 * Detect faker value based on field type
 */
function getFakerValueByType(type: FieldType): string {
  const types: Record<FieldType, string> = {
    email: 'faker.internet.email()',
    phone: 'faker.phone.number()',
    integer: 'faker.number.int({ min: 1, max: 1000 })',
    float: 'faker.number.float({ min: 1, max: 1000, precision: 0.01 })',
    boolean: 'faker.datatype.boolean()',
    datetime: 'faker.date.recent().toISOString()',
    json: '{ key: "value" }',
    string: 'faker.lorem.word()',
    text: 'faker.lorem.paragraph()',
  };

  return types[type] || 'faker.lorem.word()';
}

/**
 * Build state pattern methods
 */
function buildStatePatterns(modelName: string): string {
  return `  /**
   * State: Active
   */
  private getActiveState(): Partial<${modelName}> {
    return {
      active: true,
      deleted_at: null,
    };
  }

  /**
   * State: Inactive
   */
  private getInactiveState(): Partial<${modelName}> {
    return {
      active: false,
    };
  }

  /**
   * State: Deleted (soft delete)
   */
  private getDeletedState(): Partial<${modelName}> {
    return {
      deleted_at: faker.date.past().toISOString(),
    };
  }`;
}

/**
 * Build relationship methods
 */
function buildRelationshipMethods(relationships: string[]): string {
  if (relationships.length === 0) {
    return '';
  }

  return relationships
    .map((rel) => {
      const factoryName = `${rel}Factory`;
      const relField = camelCase(rel) + '_id';
      return `  /**
   * Associate ${rel}
   */
  with${rel}(id?: number): this {
    this.data.${relField} = id || ${factoryName}.new().create().id;
    return this;
  }`;
    })
    .join('\n\n  ');
}

/**
 * Get default fields for common models
 */
function getDefaultFields(modelName: string): FactoryField[] {
  const defaults: Record<string, FactoryField[]> = {
    User: [
      { name: 'id', type: 'integer' },
      { name: 'name', type: 'string' },
      { name: 'email', type: 'email' },
      { name: 'password', type: 'string' },
      { name: 'email_verified_at', type: 'datetime', nullable: true },
      { name: 'active', type: 'boolean' },
      { name: 'created_at', type: 'datetime' },
      { name: 'updated_at', type: 'datetime' },
    ],
    Post: [
      { name: 'id', type: 'integer' },
      { name: 'user_id', type: 'integer' },
      { name: 'title', type: 'string' },
      { name: 'content', type: 'text' },
      { name: 'published', type: 'boolean' },
      { name: 'created_at', type: 'datetime' },
      { name: 'updated_at', type: 'datetime' },
    ],
    Product: [
      { name: 'id', type: 'integer' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'text' },
      { name: 'price', type: 'float' },
      { name: 'stock', type: 'integer' },
      { name: 'active', type: 'boolean' },
      { name: 'created_at', type: 'datetime' },
      { name: 'updated_at', type: 'datetime' },
    ],
    Order: [
      { name: 'id', type: 'integer' },
      { name: 'user_id', type: 'integer' },
      { name: 'total', type: 'float' },
      { name: 'status', type: 'string' },
      { name: 'created_at', type: 'datetime' },
      { name: 'updated_at', type: 'datetime' },
    ],
  };

  return defaults[modelName] ?? [{ name: 'id', type: 'integer' }];
}

/**
 * Convert PascalCase to camelCase
 */
function camelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Get available types
 */
export function getAvailableTypes(): string[] {
  return ['string', 'integer', 'float', 'boolean', 'text', 'datetime', 'json', 'email', 'phone'];
}

/**
 * Factory Generator - Generates test data factories
 */
export const FactoryGenerator = {
  validateOptions,
  generateFactory,
  getAvailableTypes,
};
