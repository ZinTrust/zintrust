/**
 * ServiceRequestFactoryGenerator - Generate inter-service request factories
 * Creates type-safe factories for testing service-to-service API calls
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import path from 'node:path';

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
 * ServiceRequestFactoryGenerator creates factories for inter-service requests
 */

/**
 * Validate options
 */
export function validateOptions(options: ServiceRequestOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (options.name === undefined || !/^[A-Z][a-zA-Z0-9]*Request$/.test(options.name)) {
    errors.push(`Invalid factory name '${options.name}'. Must match pattern: *Request`);
  }

  if (options.serviceName === undefined || !/^[a-z][a-z0-9_]*$/.test(options.serviceName)) {
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
 * Usage: ${factoryClassName}.make() or ${factoryClassName}.times(5).make()
 */
export class ${factoryClassName} {
  ${buildFactoryClassBody(options, factoryClassName, interfaceNameRequest, fakerMethods)}
}

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
 * Build factory class body
 */
function buildFactoryClassBody(
  options: ServiceRequestOptions,
  factoryClassName: string,
  interfaceNameRequest: string,
  fakerMethods: string
): string {
  return `private _count: number = 1;
  private _state: 'valid' | 'invalid' | 'minimal' = 'valid';
  private _overrides: Partial<${interfaceNameRequest}> = {};

${buildFactoryStaticMethods(factoryClassName, interfaceNameRequest)}

${buildFactoryChainMethods(factoryClassName, interfaceNameRequest)}

${buildFactoryGenerationMethods(interfaceNameRequest)}

${buildFactoryStateMethods(options, interfaceNameRequest)}

  /**
   * Faker helper methods
   */
${fakerMethods}`;
}

/**
 * Build factory static methods
 */
function buildFactoryStaticMethods(factoryClassName: string, interfaceNameRequest: string): string {
  return `  /**
   * Create a new factory instance
   */
  static make(): ${interfaceNameRequest} {
    return new ${factoryClassName}().make();
  }

  /**
   * Create multiple instances
   */
  static times(count: number): ${factoryClassName} {
    const factory = new ${factoryClassName}();
    factory._count = count;
    return factory;
  }

  /**
   * Create factory with state
   */
  static state(state: 'valid' | 'invalid' | 'minimal'): ${factoryClassName} {
    const factory = new ${factoryClassName}();
    factory._state = state;
    return factory;
  }

  /**
   * Override specific fields
   */
  static with(overrides: Partial<${interfaceNameRequest}>): ${factoryClassName} {
    const factory = new ${factoryClassName}();
    factory._overrides = overrides;
    return factory;
  }
`;
}

/**
 * Build factory chain methods
 */
function buildFactoryChainMethods(factoryClassName: string, interfaceNameRequest: string): string {
  return `  /**
   * Set count and chain
   */
  count(count: number): ${factoryClassName} {
    this._count = count;
    return this;
  }

  /**
   * Set state and chain
   */
  withState(state: 'valid' | 'invalid' | 'minimal'): ${factoryClassName} {
    this._state = state;
    return this;
  }

  /**
   * Override fields and chain
   */
  withOverrides(overrides: Partial<${interfaceNameRequest}>): ${factoryClassName} {
    this._overrides = overrides;
    return this;
  }
`;
}

/**
 * Build factory generation methods
 */
function buildFactoryGenerationMethods(interfaceNameRequest: string): string {
  return `  /**
   * Generate count instances
   */
  makeMany(): ${interfaceNameRequest}[] {
    const items: ${interfaceNameRequest}[] = [];
    for (let i = 0; i < this._count; i++) {
      items.push(this.generateSingle());
    }
    return items;
  }

  /**
   * Generate single instance
   */
  make(): ${interfaceNameRequest} {
    return this.generateSingle();
  }

  /**
   * Generate multiple and return first
   */
  first(): ${interfaceNameRequest} {
    return this.make();
  }

  /**
   * Generate multiple and return all
   */
  get(): ${interfaceNameRequest}[] {
    return this.makeMany();
  }

  /**
   * Generate single instance based on state
   */
  private generateSingle(): ${interfaceNameRequest} {
    let data: ${interfaceNameRequest};

    switch (this._state) {
      case 'invalid':
        data = this.buildInvalidState();
        break;
      case 'minimal':
        data = this.buildMinimalState();
        break;
      case 'valid':
      default:
        data = this.buildValidState();
    }

    // Apply overrides
    return { ...data, ...this._overrides };
  }
`;
}

/**
 * Build factory state methods
 */
function buildFactoryStateMethods(
  options: ServiceRequestOptions,
  interfaceNameRequest: string
): string {
  return `  /**
   * Build valid request state
   */
  private buildValidState(): ${interfaceNameRequest} {
${buildValidStateBody(options)}
  }

  /**
   * Build invalid request state
   */
  private buildInvalidState(): ${interfaceNameRequest} {
${buildInvalidStateBody(options)}
  }

  /**
   * Build minimal request state (only required fields)
   */
  private buildMinimalState(): ${interfaceNameRequest} {
${buildMinimalStateBody(options)}
  }
`;
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
export const ${camelCase(options.name)}Factory = {
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
  invalid: () => ${factoryClassName}.state('invalid').make(),

  /**
   * Create with minimal data
   */
  minimal: () => ${factoryClassName}.state('minimal').make(),

  /**
   * Create with custom overrides
   */
  with: (overrides: Partial<${interfaceNameRequest}>) => ${factoryClassName}.with(overrides).make(),
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

  return `private ${field.name}(): ${returnType} {
    return ${fakerCall};
  }`;
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
    .map((f) => `      ${f.name}: this.${f.name}(),`)
    .join('\n');

  const optionalFields = options.fields
    .filter((f) => f.required !== true)
    .map((f) => `      ${f.name}: this.${f.name}(),`)
    .join('\n');

  return `    return {
${requiredFields}
${optionalFields}
    };`;
}

/**
 * Build invalid state body
 */
function buildInvalidStateBody(_options: ServiceRequestOptions): string {
  return `    return {
      // Invalid/empty values for error testing
      ${_options.fields[0].name}: null,
    } as unknown as Record<string, unknown>;`;
}

/**
 * Build minimal state body
 */
function buildMinimalStateBody(options: ServiceRequestOptions): string {
  const minimalFields = options.fields
    .filter((f) => f.required === true)
    .map((f) => `      ${f.name}: this.${f.name}(),`)
    .join('\n');

  return `    return {
      // Only required fields
${minimalFields}
    };`;
}

/**
 * Convert to camelCase
 */
function camelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export const ServiceRequestFactoryGenerator = {
  validateOptions,
  generateRequestFactory,
};
