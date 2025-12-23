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
  const pathExists = await fs
    .access(options.factoriesPath)
    .then(() => true)
    .catch(() => false);

  if (!pathExists) {
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
    Logger.error('Response factory generation failed', err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      factoryPath: '',
      message: `Failed to generate response factory: ${message}`,
    };
  }
}

/**
 * Generate factory methods (times, setState, make, makeMany, get, first)
 */
function generateFactoryMethods(): string {
  return `      /**
       * Generate multiple responses
       */
      times(count: number) {
        recordCount = count;
        return factory;
      },

      /**
       * Set response state (success, error, partial)
       */
      setState(state: 'success' | 'error' | 'partial') {
        responseState = state;
        return factory;
      },

      /**
       * Generate single response
       */
      make() {
        return factory.generateResponse();
      },

      /**
       * Generate multiple responses
       */
      makeMany() {
        return Array.from({ length: recordCount }, () => factory.generateResponse());
      },

      /**
       * Alias for makeMany()
       */
      get() {
        return factory.makeMany();
      },

      /**
       * Get first response
       */
      first() {
        return factory.make();
      },`;
}

/**
 * Generate response generation method
 */
function generateResponseMethod(
  responseName: string,
  fields: ResponseField[],
  responseType: string
): string {
  return `      /**
       * Generate response with state handling
       */
      generateResponse() {
        const data: Record<string, unknown> = {
${generateFieldAssignments(fields, responseType)}
        };

        // Apply state transformations
        if (responseState === 'error') {
          data.status = 'error';
          data.errors = ['An error occurred'];
        } else if (responseState === 'partial') {
          // Set some fields to null/undefined for partial response testing
          ${generatePartialFields(fields)}
        }

        return ${responseName}.create(data);
      },`;
}

/**
 * Generate response factory code
 */
function generateFactoryCode(options: ResponseFactoryOptions): string {
  const { factoryName, responseName, fields = [], responseType = 'success' } = options;

  const helperMethods = generateHelperMethods(fields);

  const dtoImport =
    options.responsesPath === undefined
      ? `export const ${responseName} = {
  create(data: Record<string, unknown> = {}) {
    return { ...data };
  }
};`
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
export const ${factoryName} = Object.freeze({
  /**
   * Create a new factory instance
   */
  new() {
    let recordCount = 1;
    let responseState = 'success';

    const factory = {
${generateFactoryMethods()}

${generateResponseMethod(responseName, fields, responseType)}

${helperMethods}
    };

    return factory;
  }
});

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

export const ${options.responseName} = Object.freeze({
  create(data: Record<string, unknown> = {}) {
    const response = {
      ...data,

      /**
       * Serialize to JSON
       */
      toJSON() {
        const d = response as any;
        return {
${(options.fields ?? []).map((f) => `          ${f.name}: d.${f.name}`).join(',\n')}
        };
      },

      /**
       * Validate response
       */
      validate(): string[] {
        const errors: string[] = [];
        const d = response as any;

${(options.fields ?? [])
  .filter((f) => f.required === true)
  .map(
    (f) => `        if (d.${f.name} === undefined || d.${f.name} === null) {
          errors.push('${f.name} is required');
        }`
  )
  .join('\n')}

        return errors;
      },
    };

    return response;
  }
};

export default ${options.responseName};
`;

  FileGenerator.writeFile(dtoPath, dtoCode);
  Logger.info(`✅ Generated response DTO: ${options.responseName}`);

  return dtoPath;
}

/**
 * Generate field assignments for the factory
 */
function generateFieldAssignments(fields: ResponseField[], responseType: string): string {
  const assignments = fields.map((field) => {
    let value = 'faker.lorem.word()';

    if (field.type === 'email') value = 'faker.internet.email()';
    else if (field.type === 'number') value = 'faker.number.int({ min: 1, max: 1000 })';
    else if (field.type === 'boolean') value = 'faker.datatype.boolean()';
    else if (field.type === 'uuid') value = 'faker.string.uuid()';
    else if (field.type === 'date') value = 'faker.date.recent().toISOString()';
    else if (field.type === 'json') value = '{ key: faker.lorem.word() }';

    if (field.array === true) {
      value = `Array.from({ length: 3 }, () => ${value})`;
    }

    return `          ${field.name}: ${value},`;
  });

  if (responseType === 'paginated') {
    // Provide a minimal, predictable pagination shape for tests and examples.
    if (!fields.some((f) => f.name === 'pagination')) {
      assignments.push('          pagination: { page: 1, limit: 10, total: 100 },');
    }
    if (!fields.some((f) => f.name === 'items')) {
      assignments.push('          items: [],');
    }
  }

  if (responseType === 'success' && !fields.some((f) => f.name === 'status')) {
    assignments.push("          status: 'success',");
  }

  return assignments.join('\n');
}

/**
 * Generate partial field modifications
 */
function generatePartialFields(fields: ResponseField[]): string {
  return fields
    .filter((f) => (f.required ?? false) !== true)
    .map((f) => `data.${f.name} = null;`)
    .join('\n          ');
}

/**
 * Generate helper methods for the factory
 */
function generateHelperMethods(fields: ResponseField[]): string {
  return fields
    .map(
      (field) => `
      /**
       * Set ${field.name}
       */
      with${capitalizeType(field.name)}(value: any) {
        return factory.generateResponse().then((res: any) => {
          res.${field.name} = value;
          return res;
        });
      },`
    )
    .join('\n');
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
export const ResponseFactoryGenerator = Object.freeze({
  validateOptions,
  generate,
});
