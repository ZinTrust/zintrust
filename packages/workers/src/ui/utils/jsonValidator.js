/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * JSON Validation Utilities
 * Client-side validation using backend schemas
 */

/**
 * Validation result interface
 */
const createValidationResult = (isValid, errors = [], warnings = []) => ({
  isValid,
  errors: [...errors],
  warnings: [...warnings],
});

/**
 * Worker validation schemas (mirroring backend)
 */
const WorkerValidationSchemas = {
  create: {
    required: ['name', 'queueName', 'processor', 'version'],
    fields: {
      name: {
        type: 'string',
        minLength: 3,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_-]+$/,
      },
      queueName: {
        type: 'string',
        minLength: 3,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_-]+$/,
      },
      processor: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
      version: {
        type: 'string',
        pattern: /^\d+\.\d+\.\d+$/,
      },
      driver: {
        type: 'string',
        allowedValues: ['database', 'redis', 'memory'],
        optional: true,
      },
      concurrency: {
        type: 'number',
        min: 1,
        max: 1000,
        optional: true,
      },
      autoStart: {
        type: 'boolean',
        optional: true,
      },
      infrastructure: {
        type: 'object',
        optional: true,
        fields: {
          driver: {
            type: 'string',
            allowedValues: ['database', 'redis', 'memory'],
          },
          persistence: {
            type: 'object',
            optional: true,
            fields: {
              driver: {
                type: 'string',
                allowedValues: ['memory', 'redis', 'database'],
              },
            },
          },
          deadLetterQueue: {
            type: 'object',
            optional: true,
            fields: {
              enabled: {
                type: 'boolean',
              },
              maxRetries: {
                type: 'number',
                min: 0,
                max: 10,
              },
            },
          },
          autoScaler: {
            type: 'object',
            optional: true,
            fields: {
              enabled: {
                type: 'boolean',
              },
              minWorkers: {
                type: 'number',
                min: 0,
                integer: true,
              },
              maxWorkers: {
                type: 'number',
                min: 1,
                integer: true,
              },
            },
          },
        },
      },
      features: {
        type: 'object',
        optional: true,
        fields: {
          clustering: { type: 'boolean' },
          metrics: { type: 'boolean' },
          autoScaling: { type: 'boolean' },
          circuitBreaker: { type: 'boolean' },
          deadLetterQueue: { type: 'boolean' },
          resourceMonitoring: { type: 'boolean' },
          compliance: { type: 'boolean' },
          observability: { type: 'boolean' },
          plugins: { type: 'boolean' },
          versioning: { type: 'boolean' },
          datacenterOrchestration: { type: 'boolean' },
        },
      },
      datacenter: {
        type: 'object',
        optional: true,
        fields: {
          primaryRegion: {
            type: 'string',
            minLength: 3,
            maxLength: 20,
            pattern: /^[a-z0-9-]+$/,
          },
          secondaryRegions: {
            type: 'array',
            optional: true,
            itemType: 'string',
          },
          affinityRules: {
            type: 'object',
            optional: true,
            fields: {
              preferLocal: { type: 'boolean' },
              maxLatency: { type: 'number', min: 0 },
              avoidRegions: {
                type: 'array',
                optional: true,
                itemType: 'string',
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Validate string field against schema constraints
 */
const validateStringField = (value, fieldSchema, fieldName, path, errors) => {
  if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} must be at least ${fieldSchema.minLength} characters long`,
      code: 'STRING_TOO_SHORT',
    });
  }

  if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} must be at most ${fieldSchema.maxLength} characters long`,
      code: 'STRING_TOO_LONG',
    });
  }

  if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} format is invalid`,
      code: 'INVALID_FORMAT',
    });
  }
};

/**
 * Validate number field against schema constraints
 */
const validateNumberField = (value, fieldSchema, fieldName, path, errors) => {
  if (fieldSchema.min !== undefined && value < fieldSchema.min) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} must be at least ${fieldSchema.min}`,
      code: 'NUMBER_TOO_SMALL',
    });
  }

  if (fieldSchema.max !== undefined && value > fieldSchema.max) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} must be at most ${fieldSchema.max}`,
      code: 'NUMBER_TOO_LARGE',
    });
  }

  if (fieldSchema.integer && !Number.isInteger(value)) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} must be a whole number (integer)`,
      code: 'NOT_INTEGER',
    });
  }
};

/**
 * Validate array field against schema constraints
 */
const validateArrayField = (value, fieldSchema, fieldName, path, errors, warnings) => {
  if (fieldSchema.itemType) {
    value.forEach((item, index) => {
      const itemResult = validateField(
        item,
        { type: fieldSchema.itemType },
        `${fieldName}[${index}]`,
        `${path || fieldName}[${index}]`
      );
      if (!itemResult.isValid) {
        errors.push(...itemResult.errors);
      }
      warnings.push(...itemResult.warnings);
    });
  }
};

/**
 * Validate object field against schema constraints
 */
const validateObjectField = (value, fieldSchema, fieldName, path, errors, warnings) => {
  if (fieldSchema.fields) {
    Object.keys(fieldSchema.fields).forEach((subFieldName) => {
      const subFieldSchema = fieldSchema.fields[subFieldName];
      const subPath = path ? `${path}.${subFieldName}` : subFieldName;
      const subResult = validateField(value[subFieldName], subFieldSchema, subFieldName, subPath);
      if (!subResult.isValid) {
        errors.push(...subResult.errors);
      }
      warnings.push(...subResult.warnings);
    });
  }
};

/**
 * Check if field meets basic requirements (required/optional)
 */
const validateBasicRequirements = (value, fieldSchema, fieldName, path) => {
  const errors = [];
  const warnings = [];

  // Check if field is required and missing
  if (fieldSchema.required && (value === undefined || value === null)) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} is required`,
      code: 'REQUIRED_FIELD',
    });
    return { shouldStop: true, result: createValidationResult(false, errors, warnings) };
  }

  // Skip validation if field is optional and not provided
  if (fieldSchema.optional && (value === undefined || value === null)) {
    return { shouldStop: true, result: createValidationResult(true, errors, warnings) };
  }

  return { shouldStop: false, result: null };
};

/**
 * Validate field type
 */
const validateFieldType = (value, fieldSchema, fieldName, path) => {
  const errors = [];
  const warnings = [];

  if (fieldSchema.type) {
    const expectedType = fieldSchema.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (actualType !== expectedType) {
      errors.push({
        path: path || fieldName,
        message: `${fieldName} must be of type ${expectedType}, got ${actualType}`,
        code: 'INVALID_TYPE',
      });
      return { isValid: false, errors, warnings };
    }
  }

  return { isValid: true, errors, warnings };
};

/**
 * Perform type-specific validations
 */
const performTypeSpecificValidations = (value, fieldSchema, fieldName, path, errors, warnings) => {
  if (typeof value === 'string') {
    validateStringField(value, fieldSchema, fieldName, path, errors);
  } else if (typeof value === 'number') {
    validateNumberField(value, fieldSchema, fieldName, path, errors);
  }

  // Allowed values validation
  if (fieldSchema.allowedValues && !fieldSchema.allowedValues.includes(value)) {
    errors.push({
      path: path || fieldName,
      message: `${fieldName} must be one of: ${fieldSchema.allowedValues.join(', ')}`,
      code: 'INVALID_VALUE',
    });
  }

  // Array validation
  if (Array.isArray(value)) {
    validateArrayField(value, fieldSchema, fieldName, path, errors, warnings);
  }

  // Object validation
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    validateObjectField(value, fieldSchema, fieldName, path, errors, warnings);
  }
};

/**
 * Validate a single field against schema
 */
const validateField = (value, fieldSchema, fieldName, path = '') => {
  const errors = [];
  const warnings = [];

  // Check basic requirements (required/optional)
  const basicCheck = validateBasicRequirements(value, fieldSchema, fieldName, path);
  if (basicCheck.shouldStop) {
    return basicCheck.result;
  }

  // Validate field type
  const typeCheck = validateFieldType(value, fieldSchema, fieldName, path);
  if (!typeCheck.isValid) {
    return createValidationResult(false, typeCheck.errors, typeCheck.warnings);
  }

  // Perform type-specific validations
  performTypeSpecificValidations(value, fieldSchema, fieldName, path, errors, warnings);

  return createValidationResult(errors.length === 0, errors, warnings);
};

/**
 * Validate worker data against schema
 */
const validateWorkerData = (data, schemaName = 'create') => {
  const schema = WorkerValidationSchemas[schemaName];
  if (!schema) {
    return createValidationResult(
      false,
      [],
      [
        {
          path: 'schema',
          message: `Unknown validation schema: ${schemaName}`,
          code: 'UNKNOWN_SCHEMA',
        },
      ]
    );
  }

  const errors = [];
  const warnings = [];

  // Check required fields
  schema.required.forEach((fieldName) => {
    if (!(fieldName in data)) {
      errors.push({
        path: fieldName,
        message: `${fieldName} is required`,
        code: 'REQUIRED_FIELD',
      });
    }
  });

  // Validate all fields
  Object.keys(data).forEach((fieldName) => {
    const fieldSchema = schema.fields[fieldName];
    if (fieldSchema) {
      const result = validateField(data[fieldName], fieldSchema, fieldName);
      if (!result.isValid) {
        errors.push(...result.errors);
      }
      warnings.push(...result.warnings);
    } else {
      warnings.push({
        path: fieldName,
        message: `Unknown field: ${fieldName}`,
        code: 'UNKNOWN_FIELD',
      });
    }
  });

  return createValidationResult(errors.length === 0, errors, warnings);
};

/**
 * Validate JSON string
 */
const validateJsonString = (jsonString) => {
  try {
    const data = JSON.parse(jsonString);
    return {
      isValid: true,
      data,
      error: null,
    };
  } catch (error) {
    return {
      isValid: false,
      data: null,
      error: error.message,
    };
  }
};

/**
 * Sealed namespace for JSON validation utilities
 */
export const JsonValidator = Object.freeze({
  validateWorkerData,
  validateJsonString,
  schemas: WorkerValidationSchemas,
  createValidationResult,
});
