/**
 * Response Factory Generator - Phase 7
 * Generates response/output DTO factories with built-in validation
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ResponseField {
  name: string;
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'date'
    | 'json'
    | 'uuid'
    | 'email'
    | 'Record<string, unknown>';
  required?: boolean;
  nullable?: boolean;
  array?: boolean;
  description?: string;
}

export interface ResponseFactoryOptions {
  factoryName: string;
  responseName: string;
  fields?: ResponseField[];
  responseType?: 'success' | 'error' | 'paginated' | 'custom';
  factoriesPath: string;
  responsesPath?: string;
}

export interface ResponseFactoryGeneratorResult {
  success: boolean;
  factoryPath: string;
  responsePath?: string;
  message: string;
}

/**
 * Validate response factory options
 */
export async function validateOptions(options: ResponseFactoryOptions): Promise<void> {
  if (options.factoryName.trim() === '') {
    throw new Error('Response factory name is required');
  }

  if (options.responseName.trim() === '') {
    throw new Error('Response class name is required');
  }

  if (options.factoriesPath === '') {
    throw new Error('Factories path is required');
  }

  // Verify factory path exists
  try {
    await fs.access(options.factoriesPath);
  } catch {
    throw new Error(`Factories directory not found: ${options.factoriesPath}`);
  }
}

/**
 * Generate response factory
 */
export async function generate(
  options: ResponseFactoryOptions
): Promise<ResponseFactoryGeneratorResult> {
  try {
    await validateOptions(options);

    const factoryPath = path.join(options.factoriesPath, `${options.factoryName}.ts`);

    const factoryCode = generateFactoryCode(options);

    // Write factory file
    FileGenerator.writeFile(factoryPath, factoryCode);

    Logger.info(`✅ Generated response factory: ${options.factoryName}`);

    // Generate response DTO if requested
    let responsePath: string | undefined;
    if (options.responsesPath !== undefined) {
      responsePath = await generateResponseDTO(options);
    }

    return {
      success: true,
      factoryPath,
      responsePath,
      message: `Response factory '${options.factoryName}' generated successfully`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Failed to generate response factory: ${message}`);
    throw err;
  }
}

/**
 * Generate response factory code
 */
function generateFactoryCode(options: ResponseFactoryOptions): string {
  const { factoryName, responseName, fields = [], responseType = 'success' } = options;

  const factoryMethods = generateFactoryMethods(factoryName, responseName, fields, responseType);
  const helperMethods = generateHelperMethods(fields);

  const dtoImport =
    options.responsesPath === undefined
      ? `export interface ${responseName} {
${generateFieldInterfaces(fields)}
}`
      : `import { ${responseName} } from '@app/Responses/${responseName}';`;

  return `/**
 * ${factoryName} - Response Factory
 * Generates ${responseName} response instances for testing
 *
 * Response Type: ${responseType}
 */

import { faker } from '@faker-js/faker';

${dtoImport}

/**
 * ${factoryName} - Generates response test data
 */
export class ${factoryName} {
  private count = 1;
  private state: 'success' | 'error' | 'partial' = 'success';

${factoryMethods}

${helperMethods}
}

export default ${factoryName};
`;
}

/**
 * Generate response DTO code
 */
async function generateResponseDTO(options: ResponseFactoryOptions): Promise<string> {
  if (options.responsesPath === undefined) {
    throw new Error('Responses path is required');
  }

  const dtoPath = path.join(options.responsesPath, `${options.responseName}.ts`);

  const dtoCode = `/**
 * ${options.responseName} - Response DTO
 * Serializes and validates API response data
 *
 * Type: ${options.responseType}
 */

${generateDTOFields(options.fields ?? [])}

export class ${options.responseName} {
${generateDTOConstructor(options.fields ?? [])}

${generateDTOMethods(options.fields ?? [])}
}

export default ${options.responseName};
`;

  FileGenerator.writeFile(dtoPath, dtoCode);
  Logger.info(`✅ Generated response DTO: ${options.responseName}`);

  return dtoPath;
}

/**
 * Generate field interfaces
 */
function generateFieldInterfaces(fields: ResponseField[]): string {
  return generateFieldDeclarations(fields);
}

/**
 * Generate DTO field declarations
 */
function generateDTOFields(fields: ResponseField[]): string {
  return generateFieldDeclarations(fields);
}

/**
 * Generate field declarations (shared implementation)
 */
function generateFieldDeclarations(fields: ResponseField[]): string {
  return fields
    .map(
      (field) =>
        `  ${field.name}${field.required === true ? '' : '?'}: ${getTypeScriptType(field)};`
    )
    .join('\n');
}

/**
 * Generate factory methods (create, times, state, make, etc.)
 */
function generateFactoryMethods(
  factoryName: string,
  responseName: string,
  fields: ResponseField[],
  responseType: string
): string {
  return `  /**
   * Create a new factory instance
   */
  static create(): ${factoryName} {
    return new ${factoryName}();
  }

  /**
   * Generate multiple responses
   */
  times(count: number): this {
    this.count = count;
    return this;
  }

  /**
   * Set response state (success, error, partial)
   */
  setState(state: 'success' | 'error' | 'partial'): this {
    this.state = state;
    return this;
  }

  /**
   * Generate single response
   */
  make(): ${responseName} {
    return this.generateResponse();
  }

  /**
   * Generate multiple responses
   */
  makeMany(): ${responseName}[] {
    const responses: ${responseName}[] = [];
    for (let i = 0; i < this.count; i++) {
      responses.push(this.generateResponse());
    }
    return responses;
  }

  /**
   * Alias for makeMany()
   */
  get(): ${responseName}[] {
    return this.makeMany();
  }

  /**
   * Get first response
   */
  first(): ${responseName} {
    return this.make();
  }

  /**
   * Generate response with state handling
   */
  private generateResponse(): ${responseName} {
    const response: ${responseName} = {
${generateFieldAssignments(fields, responseType)}
    };

    // Apply state transformations
    if (this.state === 'error') {
      response.status = 'error';
      response.errors = ['An error occurred'];
    } else if (this.state === 'partial') {
      // Set some fields to null/undefined for partial response testing
      ${generatePartialFields(fields)}
    }

    return response;
  }`;
}

/**
 * Generate field assignments with Faker data
 */
function generateFieldAssignments(fields: ResponseField[], responseType: string): string {
  const baseFields = fields
    .map((field) => `      ${field.name}: this.generate${capitalizeType(field.type)}(),`)
    .join('\n');

  const typeFields = generateTypeFields(responseType);

  return `${typeFields}
${baseFields}`;
}

/**
 * Generate type-specific response fields
 */
function generateTypeFields(responseType: string): string {
  const types: Record<string, string> = {
    success: `      status: 'success',
      code: 200,`,
    error: `      status: 'error',
      code: 400,
      errors: [],`,
    paginated: `      status: 'success',
      code: 200,
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0,
      },`,
  };

  return types[responseType] || '';
}

/**
 * Generate partial field handling
 */
function generatePartialFields(fields: ResponseField[]): string {
  const nullableFields = fields.filter((f) => f.nullable === true || f.required !== true);
  if (nullableFields.length === 0) return '';

  return nullableFields
    .slice(0, 2)
    .map((field) => `      response.${field.name} = null;`)
    .join('\n      ');
}

/**
 * Generate helper methods for field generation
 */
function generateHelperMethods(fields: ResponseField[]): string {
  const uniqueTypes = [...new Set(fields.map((f) => f.type))];

  return uniqueTypes.map((type) => generateHelperMethodForType(type)).join('\n\n');
}

/**
 * Generate a single helper method for a specific type
 */
function generateHelperMethodForType(type: string): string {
  const generators: Record<string, { body: string; returnType: string }> = {
    string: { body: 'faker.lorem.word()', returnType: 'string' },
    number: { body: 'faker.number.int({ min: 1, max: 1000 })', returnType: 'number' },
    boolean: { body: 'faker.datatype.boolean()', returnType: 'boolean' },
    date: { body: 'faker.date.recent().toISOString()', returnType: 'string' },
    json: { body: '{ key: faker.lorem.word() }', returnType: 'Record<string, unknown>' },
    uuid: { body: 'faker.string.uuid()', returnType: 'string' },
    email: { body: 'faker.internet.email()', returnType: 'string' },
  };

  const config = generators[type] ?? { body: 'null', returnType: 'unknown' };

  return `  private generate${capitalizeType(type)}(): ${config.returnType} {
    return ${config.body};
  }`;
}

/**
 * Generate DTO constructor
 */
function generateDTOConstructor(fields: ResponseField[]): string {
  const params = fields
    .map(
      (field) =>
        `    ${field.name}${field.required === true ? '' : '?'}: ${getTypeScriptType(field)}`
    )
    .join(',\n');

  const assignments = fields.map((field) => `    this.${field.name} = ${field.name};`).join('\n');

  return `  constructor(
${params}
  ) {
${assignments}
  }`;
}

/**
 * Generate DTO methods
 */
function generateDTOMethods(fields: ResponseField[]): string {
  return `  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
${fields.map((f) => `      ${f.name}: this.${f.name}`).join(',\n')}
    };
  }

  /**
   * Validate response
   */
  validate(): string[] {
    const errors: string[] = [];

${fields
  .filter((f) => f.required === true)
  .map(
    (f) => `    if (this.${f.name} === undefined || this.${f.name} === null) {
      errors.push('${f.name} is required');
    }`
  )
  .join('\n')}

    return errors;
  }`;
}

/**
 * Get TypeScript type for field
 */
function getTypeScriptType(field: ResponseField): string {
  let baseType = field.type as string;
  if (field.type === 'json') {
    baseType = 'Record<string, unknown>';
  } else if (field.type === 'date') {
    baseType = 'string';
  }

  if (field.array === true) {
    return `${baseType}[]${field.nullable === true ? ' | null' : ''}`;
  }

  return field.nullable === true ? `${baseType} | null` : baseType;
}

/**
 * Capitalize type name
 */
function capitalizeType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Response Factory Generator - Phase 7
 * Generates response/output DTO factories with built-in validation
 */
export const ResponseFactoryGenerator = {
  validateOptions,
  generate,
};
