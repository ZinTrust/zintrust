/**
 * Request Factory Generator - Phase 6.3
 * Generates request/input DTO factories with built-in validation
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { fsPromises as fs } from '@node-singletons/fs';
import * as path from '@node-singletons/path';

export interface RequestField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'phone' | 'date' | 'json' | 'uuid' | 'url';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  description?: string;
}

export interface RequestFactoryOptions {
  factoryName: string;
  requestName: string;
  fields?: RequestField[];
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  factoriesPath: string;
  requestsPath?: string;
}

export interface RequestFactoryGeneratorResult {
  success: boolean;
  factoryPath: string;
  requestPath?: string;
  message: string;
}

/**
 * Validate request factory options
 */
export async function validateOptions(options: RequestFactoryOptions): Promise<void> {
  if (options.factoryName.trim() === '') {
    throw ErrorFactory.createCliError('Request factory name is required');
  }

  if (!options.factoryName.endsWith('RequestFactory')) {
    throw ErrorFactory.createCliError(
      'Request factory name must end with "RequestFactory" (e.g., CreateUserRequestFactory)'
    );
  }

  if (!/^[A-Z][a-zA-Z\d]*RequestFactory$/.test(options.factoryName)) {
    throw ErrorFactory.createCliError(
      'Request factory name must be PascalCase ending with "RequestFactory"'
    );
  }

  if (options.requestName.trim() === '') {
    throw ErrorFactory.createCliError('Request name is required');
  }

  if (!/^[A-Z][a-zA-Z\d]*Request$/.test(options.requestName)) {
    throw ErrorFactory.createCliError('Request name must be PascalCase ending with "Request"');
  }

  // Verify factories path exists
  const pathStat = await fs.stat(options.factoriesPath).catch(() => null);

  if (pathStat === null) {
    throw ErrorFactory.createCliError(
      `Request factories path does not exist: ${options.factoriesPath}`
    );
  }

  if (!pathStat.isDirectory()) {
    throw ErrorFactory.createCliError(
      `Request factories path is not a directory: ${options.factoriesPath}`
    );
  }
}

/**
 * Generate a request factory
 */
export async function generateRequestFactory(
  options: RequestFactoryOptions
): Promise<RequestFactoryGeneratorResult> {
  try {
    await validateOptions(options);

    const factoryCode = buildFactoryCode(options);
    const factoryFileName = `${options.factoryName}.ts`;
    const factoryPath = path.join(options.factoriesPath, factoryFileName);

    FileGenerator.writeFile(factoryPath, factoryCode, { overwrite: true });

    Logger.info(`✅ Created request factory: ${factoryFileName}`);

    const result: RequestFactoryGeneratorResult = {
      success: true,
      factoryPath,
      message: `Request factory '${options.factoryName}' created successfully`,
    };

    // Optionally generate the request DTO class
    if (options.requestsPath !== undefined) {
      const requestCode = buildRequestCode(options);
      const requestFileName = `${options.requestName}.ts`;
      const requestPath = path.join(options.requestsPath, requestFileName);

      FileGenerator.writeFile(requestPath, requestCode, { overwrite: true });

      Logger.info(`✅ Created request class: ${requestFileName}`);
      result.requestPath = requestPath;
    }

    return result;
  } catch (error) {
    ErrorFactory.createTryCatchError('Request factory generation failed', error);
    return {
      success: false,
      factoryPath: '',
      message: (error as Error).message,
    };
  }
}

/**
 * Build complete request factory code
 */
function buildFactoryCode(options: RequestFactoryOptions): string {
  const fields = options.fields ?? getDefaultFields(options.requestName);
  const fieldDefinitions = buildFieldDefinitions(fields);
  const validationRules = buildValidationRules(fields);

  return `/**
 * ${options.factoryName}
 * Factory for generating ${options.requestName} test data with validation
 */

import { faker } from '@faker-js/faker';
import { ${options.requestName} } from '@app/Requests/${options.requestName}';

export const ${options.factoryName} = Object.freeze({
  ${buildFactoryObjectBody(options, fields, fieldDefinitions)}
});

${buildRequestDtoClass(options, fields, validationRules)}
`;
}

/**
 * Build factory methods (count, state, make, get)
 */
function buildFactoryMethods(options: RequestFactoryOptions, fieldDefinitions: string): string {
  return `      /**
       * Set record count
       */
      count(n: number) {
        recordCount = Math.max(1, Math.min(n, 1000));
        return factory;
      },

      /**
       * Apply a state to the factory
       */
      state(name: string) {
        states.add(name);
        return factory;
      },

      /**
       * Make a single request instance
       */
      make(overrides?: Record<string, unknown>) {
        const data: Record<string, unknown> = {};

        // Generate all fields
${fieldDefinitions}

        // Apply state modifications
        if (states.has('invalid')) factory.applyInvalidState(data);
        if (states.has('empty')) factory.applyEmptyState(data);
        if (states.has('minimal')) factory.applyMinimalState(data);

        // Apply overrides
        if (overrides !== undefined && overrides !== null) {
          Object.assign(data, overrides);
        }

        return ${options.requestName}.create(data);
      },

      /**
       * Make multiple instances
       */
      get() {
        return Array.from({ length: recordCount }, () => factory.make());
      },`;
}

/**
 * Build generateField method
 */
function buildGenerateField(fields: RequestField[]): string {
  return `      /**
       * Generate field value
       */
      generateField(fieldName: string): unknown {
        const fields = ${JSON.stringify(fields, null, 4)};
        const field = fields.find(f => f.name === fieldName);
        if (!field) return null;

        const fakerMap: Record<string, () => unknown> = {
          string: () => faker.lorem.word(),
          email: () => faker.internet.email(),
          phone: () => faker.phone.number('+1 (###) ###-####'),
          number: () => faker.number.int({ min: field.min || 1, max: field.max || 100 }),
          boolean: () => faker.datatype.boolean(),
          date: () => faker.date.future().toISOString().split('T')[0],
          uuid: () => faker.string.uuid(),
          url: () => faker.internet.url(),
          json: () => ({ data: faker.lorem.word() }),
        };

        return fakerMap[field.type]?.() ?? faker.lorem.word();
      },`;
}

/**
 * Build state modification methods
 */
function buildStateMethods(fields: RequestField[]): string {
  return `      /**
       * Apply invalid state
       */
      applyInvalidState(data: Record<string, unknown>) {
        ${buildStateModifications(fields)}
      },

      /**
       * Apply empty state
       */
      applyEmptyState(data: Record<string, unknown>) {
        Object.keys(data).forEach(key => {
          data[key] = null;
        });
      },

      /**
       * Apply minimal state
       */
      applyMinimalState(data: Record<string, unknown>) {
        const required = ${JSON.stringify(fields.filter((f) => f.required !== false).map((f) => f.name))};
        Object.keys(data).forEach(key => {
          if (!required.includes(key)) {
            delete data[key];
          }
        });
      }`;
}

/**
 * Build factory object body
 */
function buildFactoryObjectBody(
  options: RequestFactoryOptions,
  fields: RequestField[],
  fieldDefinitions: string
): string {
  return `  /**
   * Create a new factory instance
   */
  new() {
    let recordCount = 1;
    const states = new Set<string>();

    const factory = {
${buildFactoryMethods(options, fieldDefinitions)}

${buildGenerateField(fields)}

${buildStateMethods(fields)}
    };

    return factory;
  }`;
}

/**
 * Build factory state management methods
 */
function buildRequestDtoClass(
  options: RequestFactoryOptions,
  fields: RequestField[],
  validationRules: string
): string {
  return String.raw`/**
 * Request DTO factory with built-in validation
 */
export const ${options.requestName} = Object.freeze({
  create(data: Record<string, unknown> = {}) {
    const request = {
      ...data,

      /**
       * Validate request data
       */
      validate() {
        const errors: Record<string, string> = {};
        const data = request as any;

${validationRules}

        return {
          valid: Object.keys(errors).length === 0,
          errors,
        };
      },

      /**
       * Convert to plain object
       */
      toJSON() {
        const data = request as any;
        return {
${fields.map((f) => `          ${f.name}: data.${f.name}`).join(',\n')}
        };
      },

      /**
       * Helper: Validate email
       */
      isValidEmail(email: string): boolean {
        return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
      },

      /**
       * Helper: Validate phone
       */
      isValidPhone(phone: string): boolean {
        return /^\+?[1-9]\d{1,14}$/.test(phone);
      },

      /**
       * Helper: Validate URL
       */
      isValidUrl(url: string): boolean {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      },
    };

    return request;
  }
};`;
}

/**
 * Build complete request factory code
 */
function buildRequestCode(options: RequestFactoryOptions): string {
  const fields = options.fields ?? getDefaultFields(options.requestName);
  const validationRules = buildValidationRules(fields);

  return `/**
 * ${options.requestName} - Request DTO
 * ${options.method ?? 'POST'} ${options.endpoint ?? '/api/endpoint'}
 */

${buildRequestDtoClass(options, fields, validationRules)}
`;
}

/**
 * Build field definitions
 */
function buildFieldDefinitions(fields: RequestField[]): string {
  return fields.map((f) => `    data.${f.name} = this.generateField('${f.name}');`).join('\n');
}

/**
 * Build validation rules
 */
function buildValidationRules(fields: RequestField[]): string {
  const rules: string[] = [];

  for (const field of fields) {
    rules.push(...buildFieldRules(field));
  }

  return rules.join('\n\n    ');
}

/**
 * Build validation rules for a single field
 */
function buildFieldRules(field: RequestField): string[] {
  const rules: string[] = [];

  if (field.required !== false) {
    rules.push(buildRequiredRule(field.name));
  }

  if (field.type === 'email') {
    rules.push(buildEmailRule(field.name));
  }

  if (field.type === 'phone') {
    rules.push(buildPhoneRule(field.name));
  }

  if (field.type === 'url') {
    rules.push(buildUrlRule(field.name));
  }

  if (field.min !== undefined) {
    rules.push(buildMinRule(field.name, field.min));
  }

  if (field.max !== undefined) {
    rules.push(buildMaxRule(field.name, field.max));
  }

  return rules;
}

/**
 * Build required validation rule
 */
function buildRequiredRule(name: string): string {
  return `    if (!data.${name}) {
      errors.${name} = '${name} is required';
    }`;
}

/**
 * Build email validation rule
 */
function buildEmailRule(name: string): string {
  return `    if (data.${name} && !this.isValidEmail(data.${name})) {
      errors.${name} = '${name} must be a valid email';
    }`;
}

/**
 * Build phone validation rule
 */
function buildPhoneRule(name: string): string {
  return `    if (data.${name} && !this.isValidPhone(data.${name})) {
      errors.${name} = '${name} must be a valid phone number';
    }`;
}

/**
 * Build URL validation rule
 */
function buildUrlRule(name: string): string {
  return `    if (data.${name} && !this.isValidUrl(data.${name})) {
      errors.${name} = '${name} must be a valid URL';
    }`;
}

/**
 * Build min length validation rule
 */
function buildMinRule(name: string, min: number): string {
  return `    if (data.${name} && data.${name}.length < ${min}) {
      errors.${name} = '${name} must be at least ${min} characters';
    }`;
}

/**
 * Build max length validation rule
 */
function buildMaxRule(name: string, max: number): string {
  return `    if (data.${name} && data.${name}.length > ${max}) {
      errors.${name} = '${name} must be at most ${max} characters';
    }`;
}

/**
 * Build state modifications
 */
function buildStateModifications(fields: RequestField[]): string {
  const requiredFields = fields.filter((f) => f.required !== false);
  if (requiredFields.length === 0) return '';

  return requiredFields.map((f) => `delete data.${f.name};`).join('\n      ');
}

/**
 * Get default fields for a request type
 */
function getDefaultFields(requestName: string): RequestField[] {
  const requestType = requestName.replace(/Request$/, '').toLowerCase();

  const defaults: Record<string, RequestField[]> = {
    create: [
      { name: 'name', type: 'string', required: true, min: 1, max: 255 },
      { name: 'email', type: 'email', required: true },
      { name: 'description', type: 'string', required: false, max: 1000 },
    ],
    update: [
      { name: 'name', type: 'string', required: false, min: 1, max: 255 },
      { name: 'email', type: 'email', required: false },
      { name: 'description', type: 'string', required: false, max: 1000 },
    ],
    login: [
      { name: 'email', type: 'email', required: true },
      { name: 'password', type: 'string', required: true, min: 8 },
    ],
    register: [
      { name: 'name', type: 'string', required: true, min: 2, max: 255 },
      { name: 'email', type: 'email', required: true },
      { name: 'password', type: 'string', required: true, min: 8 },
    ],
  };

  // Find matching default
  for (const [key, fields] of Object.entries(defaults)) {
    if (requestType.includes(key)) {
      return fields;
    }
  }

  // Default fields if no match
  return [
    { name: 'id', type: 'number', required: false },
    { name: 'data', type: 'json', required: true },
  ];
}

/**
 * Get available options
 */
export function getAvailableOptions(): string[] {
  return [
    'Request factory generation',
    'Built-in validation rules',
    'State patterns (invalid, empty, minimal)',
    'Field type detection',
    'Automatic DTO generation',
    'Faker.js integration',
  ];
}

/**
 * Request Factory Generator - Creates request/input DTO factories with validation
 * Generates both the request factory (for testing) and the DTO class (for request handling)
 */
export const RequestFactoryGenerator = Object.freeze({
  validateOptions,
  generateRequestFactory,
  getAvailableOptions,
});
