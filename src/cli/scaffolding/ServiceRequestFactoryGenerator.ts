/**
 * ServiceRequestFactoryGenerator - Generate inter-service request factories
 * Creates type-safe factories for testing service-to-service API calls
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { CommonUtils } from '@common/index';
import { Logger } from '@config/logger';
import * as path from 'node:path';

export interface ServiceRequestField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'email' | 'url' | 'uuid';
  required?: boolean;
  validation?: string[];
  example?: string | number | boolean;
  description?: string;
}

export interface ServiceRequestOptions {
  name: string; // e.g., "CreateUserRequest"
  serviceName: string; // e.g., "users"
  endpoint: string; // e.g., "/api/users"
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  fields: ServiceRequestField[];
  factoryPath: string; // Path to factories/
  authenticated?: boolean;
  headers?: Record<string, string>;
  description?: string;
}

export interface ServiceRequestFactoryResult {
  success: boolean;
  factoryName: string;
  factoryFile: string;
  message: string;
}

/**
 * Validate options
 */
export function validateOptions(options: ServiceRequestOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (options.name === undefined || !/^[A-Z][a-zA-Z\d]*Request$/.test(options.name)) {
    errors.push(`Invalid factory name '${options.name}'. Must match pattern: *Request`);
  }

  if (options.serviceName === undefined || !/^[a-z][a-z\d_]*$/.test(options.serviceName)) {
    errors.push(
      `Invalid service name '${options.serviceName}'. Must be lowercase with underscores.`
    );
  }

  if (!options.endpoint?.startsWith('/')) {
    errors.push(`Invalid endpoint '${options.endpoint}'. Must start with /`);
  }

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
    errors.push(`Invalid HTTP method '${options.method}'.`);
  }

  if (options.factoryPath === undefined || !FileGenerator.directoryExists(options.factoryPath)) {
    errors.push(`Factories directory does not exist: ${options.factoryPath}`);
  }

  if (options.fields === undefined || options.fields.length === 0) {
    errors.push(`At least one field is required`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate request factory file
 */
export async function generateRequestFactory(
  options: ServiceRequestOptions
): Promise<ServiceRequestFactoryResult> {
  const validation = validateOptions(options);
  if (!validation.valid) {
    return {
      success: false,
      factoryName: options.name,
      factoryFile: '',
      message: `Validation failed: ${validation.errors.join(', ')}`,
    };
  }

  try {
    const factoryContent = buildFactoryCode(options);
    const factoryFile = path.join(options.factoryPath, `${options.name}Factory.ts`);

    FileGenerator.writeFile(factoryFile, factoryContent);

    Logger.info(`✅ Generated service request factory: ${factoryFile}`);

    return {
      success: true,
      factoryName: options.name,
      factoryFile,
      message: `Service request factory generated successfully`,
    };
  } catch (error) {
    Logger.error(`Error generating service request factory:`, error);
    return {
      success: false,
      factoryName: options.name,
      factoryFile: '',
      message: `Generation failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Build factory code
 */
function buildFactoryCode(options: ServiceRequestOptions): string {
  const factoryClassName = `${options.name}Factory`;
  const interfaceNameRequest = options.name;
  const interfaceNameResponse = `${options.name.replace('Request', '')}Response`;

  const fields = options.fields.map((f) => buildFieldLine(f)).join('\n    ');
  const fakerMethods = options.fields.map((f) => buildFakerMethod(f)).join('\n  ');

  return `/**
 * ${factoryClassName} - Inter-service request factory
 * Generates test payloads for ${options.serviceName} service
 * Endpoint: ${options.method} ${options.endpoint}
 */

import { faker } from '@faker-js/faker';

${buildInterfaces(interfaceNameRequest, interfaceNameResponse, fields)}

/**
 * ${factoryClassName} - Factory for generating test requests
 * Usage: ${factoryClassName}.make() or ${factoryClassName}.new().count(5).makeMany()
 */
export const ${factoryClassName} = {
${buildFactoryObjectBody(options, interfaceNameRequest, fakerMethods)}
};

${buildFactoryHelpers(options, factoryClassName, interfaceNameRequest)}
`;
}

/**
 * Build interfaces
 */
function buildInterfaces(request: string, response: string, fields: string): string {
  return `/**
 * ${request} - Request payload interface
 */
export interface ${request} {
${fields}
}

/**
 * ${response} - Response payload interface
 */
export interface ${response} {
  success: boolean;
  data?: ${request};
  message?: string;
  errors?: Record<string, string[]>;
}`;
}

/**
 * Build factory object body
 */
function buildFactoryObjectBody(
  options: ServiceRequestOptions,
  interfaceNameRequest: string,
  fakerMethods: string
): string {
  return `  /**
   * Create a single instance immediately
   */
  make(): ${interfaceNameRequest} {
    return this.new().make();
  },

  /**
   * Create multiple instances immediately
   */
  times(count: number) {
    return this.new().count(count);
  },

  /**
   * Create a new factory instance for chaining
   */
  new() {
    let recordCount = 1;
    let factoryState: 'valid' | 'invalid' | 'minimal' = 'valid';
    let factoryOverrides: Partial<${interfaceNameRequest}> = {};

    const factory = {
${buildFactoryMethods(interfaceNameRequest, options, fakerMethods)}
    };

    return factory;
  }`;
}

/**
 * Build core factory methods for chaining
 */
function buildCoreFactoryMethods(interfaceNameRequest: string): string {
  return `      /**
       * Set count and chain
       */
      count(count: number) {
        recordCount = count;
        return factory;
      },

      /**
       * Set state and chain
       */
      withState(state: 'valid' | 'invalid' | 'minimal') {
        factoryState = state;
        return factory;
      },

      /**
       * Override fields and chain
       */
      withOverrides(overrides: Partial<${interfaceNameRequest}>) {
        factoryOverrides = overrides;
        return factory;
      },

      /**
       * Generate count instances
       */
      makeMany(): ${interfaceNameRequest}[] {
        return Array.from({ length: recordCount }, () => factory.make());
      },

      /**
       * Generate single instance
       */
      make(): ${interfaceNameRequest} {
        let data: ${interfaceNameRequest};

        switch (factoryState) {
          case 'invalid':
            data = factory.buildInvalidState();
            break;
          case 'minimal':
            data = factory.buildMinimalState();
            break;
          case 'valid':
          default:
            data = factory.buildValidState();
        }

        // Apply overrides
        return { ...data, ...factoryOverrides };
      },

      /**
       * Alias for makeMany()
       */
      get(): ${interfaceNameRequest}[] {
        return factory.makeMany();
      },`;
}

/**
 * Build state factory methods
 */
function buildStateFactoryMethods(
  options: ServiceRequestOptions,
  interfaceNameRequest: string
): string {
  return `      /**
       * Build valid request state
       */
      buildValidState(): ${interfaceNameRequest} {
${buildValidStateBody(options)}
      },

      /**
       * Build invalid request state
       */
      buildInvalidState(): ${interfaceNameRequest} {
${buildInvalidStateBody(options)}
      },

      /**
       * Build minimal request state (only required fields)
       */
      buildMinimalState(): ${interfaceNameRequest} {
${buildMinimalStateBody(options)}
      },`;
}

/**
 * Build factory methods for chaining
 */
function buildFactoryMethods(
  interfaceNameRequest: string,
  options: ServiceRequestOptions,
  fakerMethods: string
): string {
  return `
${buildCoreFactoryMethods(interfaceNameRequest)}

${buildStateFactoryMethods(options, interfaceNameRequest)}

      /**
       * Faker helper methods
       */
${fakerMethods}`;
}

/**
 * Build factory helpers
 */
function buildFactoryHelpers(
  options: ServiceRequestOptions,
  factoryClassName: string,
  interfaceNameRequest: string
): string {
  return `/**
 * Request factory helpers
 */
export const ${CommonUtils.camelCase(options.name)}Factory = {
  /**
   * Create single request
   */
  make: () => ${factoryClassName}.make(),

  /**
   * Create multiple requests
   */
  makeMany: (count: number) => ${factoryClassName}.times(count).makeMany(),

  /**
   * Create with invalid data for error testing
   */
  invalid: () => ${factoryClassName}.new().withState('invalid').make(),

  /**
   * Create with minimal data
   */
  minimal: () => ${factoryClassName}.new().withState('minimal').make(),

  /**
   * Create with custom overrides
   */
  with: (overrides: Partial<${interfaceNameRequest}>) => ${factoryClassName}.new().withOverrides(overrides).make(),
};`;
}

/**
 * Build single field type definition
 */
function buildFieldLine(field: ServiceRequestField): string {
  const required = field.required === true ? '' : '?';
  let type = field.type as string;

  // Map types to TypeScript
  switch (field.type) {
    case 'date':
      type = 'Date';
      break;
    case 'email':
    case 'url':
    case 'uuid':
      type = 'string';
      break;
    case 'array':
      type = 'unknown[]';
      break;
    case 'object':
      type = 'Record<string, unknown>';
      break;
  }

  return `${field.name}${required}: ${type}; // ${field.description ?? 'Field description'}`;
}

/**
 * Build faker method for field
 */
function buildFakerMethod(field: ServiceRequestField): string {
  const fakerCall = getFakerCall(field.type);
  const returnType = getReturnType(field.type);

  return `      ${field.name}(): ${returnType} {
        return ${fakerCall};
      },`;
}

/**
 * Get faker call for field type
 */
function getFakerCall(type: string): string {
  const fakerMap: Record<string, string> = {
    email: 'faker.internet.email()',
    url: 'faker.internet.url()',
    uuid: 'faker.string.uuid()',
    number: 'faker.number.int({ min: 1, max: 1000 })',
    boolean: 'faker.datatype.boolean()',
    date: 'faker.date.future()',
    array: '[faker.word.words()]',
    object: '{ key: faker.word.words() }',
  };

  return fakerMap[type] || 'faker.word.words()';
}

/**
 * Get return type for field type
 */
function getReturnType(type: string): string {
  const typeMap: Record<string, string> = {
    date: 'Date',
    email: 'string',
    url: 'string',
    uuid: 'string',
    array: 'unknown[]',
    object: 'Record<string, unknown>',
  };

  return typeMap[type] || type;
}

/**
 * Build valid state body
 */
function buildValidStateBody(options: ServiceRequestOptions): string {
  const requiredFields = options.fields
    .filter((f) => f.required === true)
    .map((f) => `        ${f.name}: factory.${f.name}(),`)
    .join('\n');

  const optionalFields = options.fields
    .filter((f) => f.required !== true)
    .map((f) => `        ${f.name}: factory.${f.name}(),`)
    .join('\n');

  return `        return {
${requiredFields}
${optionalFields}
        };`;
}

/**
 * Build invalid state body
 */
function buildInvalidStateBody(_options: ServiceRequestOptions): string {
  return `        return {
          // Invalid/empty values for error testing
          ${_options.fields[0].name}: null,
        } as unknown as Record<string, unknown> as ${_options.name};`;
}

/**
 * Build minimal state body
 */
function buildMinimalStateBody(options: ServiceRequestOptions): string {
  const minimalFields = options.fields
    .filter((f) => f.required === true)
    .map((f) => `        ${f.name}: factory.${f.name}(),`)
    .join('\n');

  return `        return {
          // Only required fields
${minimalFields}
        };`;
}

export const ServiceRequestFactoryGenerator = Object.freeze({
  validateOptions,
  generateRequestFactory,
});
