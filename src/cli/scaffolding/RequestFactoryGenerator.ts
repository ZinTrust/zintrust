/**
 * Request Factory Generator - Phase 6.3
 * Generates request/input DTO factories with built-in validation
 */

import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';
import fs from 'node:fs/promises';
import path from 'node:path';

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
    throw new Error('Request factory name is required');
  }

  if (!options.factoryName.endsWith('RequestFactory')) {
    throw new Error(
      'Request factory name must end with "RequestFactory" (e.g., CreateUserRequestFactory)'
    );
  }

  if (!/^[A-Z][a-zA-Z0-9]*RequestFactory$/.test(options.factoryName)) {
    throw new Error('Request factory name must be PascalCase ending with "RequestFactory"');
  }

  if (options.requestName.trim() === '') {
    throw new Error('Request name is required');
  }

  if (!/^[A-Z][a-zA-Z0-9]*Request$/.test(options.requestName)) {
    throw new Error('Request name must be PascalCase ending with "Request"');
  }

  // Verify factories path exists
  const pathStat = await fs.stat(options.factoriesPath).catch(() => null);

  if (pathStat === null) {
    throw new Error(`Request factories path does not exist: ${options.factoriesPath}`);
  }

  if (!pathStat.isDirectory()) {
    throw new Error(`Request factories path is not a directory: ${options.factoriesPath}`);
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
    Logger.error('Request factory generation failed', error);
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

export class ${options.factoryName} {
  ${buildFactoryClassBody(options, fields, fieldDefinitions)}

  ${buildStateManagementMethods(fields)}

  /**
   * Get required field names
   */
  private getRequiredFields(): string[] {
    return this.getAllFields().filter(f => f.required !== false).map(f => f.name);
  }
}

${buildRequestDtoClass(options, fields, validationRules)}
`;
}

/**
 * Build state management methods
 */
function buildStateManagementMethods(fields: RequestField[]): string {
  return `/**
   * Apply state modifications
   */
  private applyStates(data: Record<string, unknown>): void {
    if (this.states.has('invalid')) {
      this.applyInvalidState(data);
    }

    if (this.states.has('empty')) {
      this.applyEmptyState(data);
    }

    if (this.states.has('minimal')) {
      this.applyMinimalState(data);
    }
  }

  /**
   * Apply invalid state
   */
  private applyInvalidState(data: Record<string, unknown>): void {
    // Remove required fields to trigger validation errors
    ${buildStateModifications(fields)}
  }

  /**
   * Apply empty state
   */
  private applyEmptyState(data: Record<string, unknown>): void {
    Object.keys(data).forEach(key => {
      data[key] = null;
    });
  }

  /**
   * Apply minimal state
   */
  private applyMinimalState(data: Record<string, unknown>): void {
    const required = this.getRequiredFields();
    Object.keys(data).forEach(key => {
      if (!required.includes(key)) {
        delete data[key];
      }
    });
  }`;
}

/**
 * Build factory class body
 */
function buildFactoryClassBody(
  options: RequestFactoryOptions,
  fields: RequestField[],
  fieldDefinitions: string
): string {
  return `private data: Record<string, unknown> = {};
  private count = 1;
  private states: Set<string> = new Set();

${buildFactoryStaticMethods(options)}

${buildFactoryStateManagement()}

${buildFactoryGenerationMethods(options, fieldDefinitions)}

${buildFactoryHelperMethods(fields)}`;
}

/**
 * Build factory static methods
 */
function buildFactoryStaticMethods(options: RequestFactoryOptions): string {
  return `  /**
   * Create a single request instance
   */
  static create(overrides?: Partial<${options.requestName}>): ${options.requestName} {
    return new this().make(overrides);
  }

  /**
   * Create multiple request instances
   */
  static times(count: number): ${options.factoryName} {
    return new this().count(count);
  }

  /**
   * Set record count
   */
  count(n: number): this {
    this.count = Math.max(1, Math.min(n, 1000));
    return this;
  }
`;
}

/**
 * Build factory state management methods
 */
function buildFactoryStateManagement(): string {
  return `  /**
   * Apply a state to the factory
   */
  state(name: string): this {
    this.states.add(name);
    return this;
  }

  /**
   * Apply state modifications
   */
  private applyStates(data: Record<string, unknown>): void {
    this.states.forEach(state => {
      const methodName = \`apply\${state.charAt(0).toUpperCase() + state.slice(1)}State\`;
      if (typeof (this as any)[methodName] === 'function') {
        (this as any)[methodName](data);
      }
    });
  }
`;
}

/**
 * Build factory generation methods
 */
function buildFactoryGenerationMethods(
  options: RequestFactoryOptions,
  fieldDefinitions: string
): string {
  return `  /**
   * Make a single request instance
   */
  make(overrides?: Partial<${options.requestName}>): ${options.requestName} {
    const data: Record<string, unknown> = {};

    // Generate all fields
${fieldDefinitions}

    // Apply state modifications
    this.applyStates(data);

    // Apply overrides
    if (overrides !== undefined && overrides !== null) {
      Object.assign(data, overrides);
    }

    return new ${options.requestName}(data);
  }

  /**
   * Make multiple instances
   */
  makeMany(): ${options.requestName}[] {
    const instances: ${options.requestName}[] = [];
    for (let i = 0; i < this.count; i++) {
      instances.push(this.make());
    }
    return instances;
  }

  /**
   * Get records (alias for makeMany)
   */
  get(): ${options.requestName}[] {
    return this.makeMany();
  }
`;
}

/**
 * Build factory helper methods
 */
function buildFactoryHelperMethods(fields: RequestField[]): string {
  return `  /**
   * Generate field value
   */
  private generateField(fieldName: string): unknown {
    const field = this.findField(fieldName);
    if (field === undefined || field === null) return null;

    return this.getFakerValue(field);
  }

  ${buildFakerValueMethod()}

  /**
   * Find field definition
   */
  private findField(fieldName: string): RequestField | undefined {
    const fields = this.getAllFields();
    return fields.find(f => f.name === fieldName);
  }

  /**
   * Get all field definitions
   */
  private getAllFields(): RequestField[] {
    return ${JSON.stringify(fields, null, 4)};
  }
`;
}

/**
 * Build faker value method
 */
function buildFakerValueMethod(): string {
  return `/**
   * Get faker value for field
   */
  private getFakerValue(field: RequestField): unknown {
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
  }`;
}

/**
 * Build request DTO class
 */
function buildRequestDtoClass(
  options: RequestFactoryOptions,
  fields: RequestField[],
  validationRules: string
): string {
  return `/**
 * Request DTO class with built-in validation
 */
export class ${options.requestName} {
${fields.map((f) => `  ${f.name}${f.required === false ? '?' : ''}: ${tsType(f.type)};`).join('\n')}

  constructor(data: Record<string, unknown> = {}) {
    Object.assign(this, data);
  }

  /**
   * Validate request data
   */
  validate(): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

${validationRules}

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Convert to plain object
   */
  toJSON(): Record<string, unknown> {
    return {
${fields.map((f) => `      ${f.name}: this.${f.name}`).join(',\n')}
    };
  }
}`;
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
 * Map RequestField type to TypeScript type
 */
function tsType(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    email: 'string',
    phone: 'string',
    date: 'string',
    json: 'Record<string, unknown>',
    uuid: 'string',
    url: 'string',
  };
  return typeMap[type] || 'string';
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
export const RequestFactoryGenerator = {
  validateOptions,
  generateRequestFactory,
  getAvailableOptions,
};
