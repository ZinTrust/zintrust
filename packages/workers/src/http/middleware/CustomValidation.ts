import { Logger, type IRequest, type IResponse } from '@zintrust/core';

export type RouteHandler = (req: IRequest, res: IResponse) => Promise<void> | void;

export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    default?: unknown;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    allowedValues?: unknown[];
    custom?: (value: unknown) => string | null; // Returns error message or null
  };
}

/**
 * Custom validation middleware that accepts a validation schema
 * Provides flexible validation for any request data structure
 */
const validateRequiredField = (
  fieldName: string,
  value: unknown,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string } | null => {
  if (fieldSchema.required && (value === undefined || value === null)) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
      code: 'MISSING_REQUIRED_FIELD',
    };
  }
  return null;
};

const validateFieldType = (
  fieldName: string,
  value: unknown,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string } | null => {
  if (!fieldSchema.type) return null;

  const actualType = Array.isArray(value) ? 'array' : typeof value;
  if (actualType !== fieldSchema.type) {
    return {
      field: fieldName,
      message: `${fieldName} must be of type ${fieldSchema.type}`,
      code: 'INVALID_TYPE',
    };
  }
  return null;
};

const validateStringField = (
  fieldName: string,
  value: string,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string }[] => {
  const errors: { field: string; message: string; code: string }[] = [];

  if (fieldSchema.minLength !== undefined && value.length < fieldSchema.minLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at least ${fieldSchema.minLength} characters long`,
      code: 'STRING_TOO_SHORT',
    });
  }

  if (fieldSchema.maxLength !== undefined && value.length > fieldSchema.maxLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at most ${fieldSchema.maxLength} characters long`,
      code: 'STRING_TOO_LONG',
    });
  }

  if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} format is invalid`,
      code: 'INVALID_FORMAT',
    });
  }

  return errors;
};

const validateNumberField = (
  fieldName: string,
  value: number,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string }[] => {
  const errors: { field: string; message: string; code: string }[] = [];

  if (fieldSchema.min !== undefined && value < fieldSchema.min) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at least ${fieldSchema.min}`,
      code: 'NUMBER_TOO_SMALL',
    });
  }

  if (fieldSchema.max !== undefined && value > fieldSchema.max) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be at most ${fieldSchema.max}`,
      code: 'NUMBER_TOO_LARGE',
    });
  }

  return errors;
};

const validateArrayField = (
  fieldName: string,
  value: unknown[],
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string }[] => {
  const errors: { field: string; message: string; code: string }[] = [];

  if (fieldSchema.minLength !== undefined && value.length < fieldSchema.minLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must contain at least ${fieldSchema.minLength} items`,
      code: 'ARRAY_TOO_SHORT',
    });
  }

  if (fieldSchema.maxLength !== undefined && value.length > fieldSchema.maxLength) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must contain at most ${fieldSchema.maxLength} items`,
      code: 'ARRAY_TOO_LONG',
    });
  }

  return errors;
};

const validateAllowedValues = (
  fieldName: string,
  value: unknown,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string } | null => {
  if (fieldSchema.allowedValues && !fieldSchema.allowedValues.includes(value)) {
    return {
      field: fieldName,
      message: `${fieldName} must be one of: ${fieldSchema.allowedValues.join(', ')}`,
      code: 'INVALID_VALUE',
    };
  }
  return null;
};

const validateCustomRule = (
  fieldName: string,
  value: unknown,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string } | null => {
  if (fieldSchema.custom) {
    const customError = fieldSchema.custom(value);
    if (customError) {
      return {
        field: fieldName,
        message: customError,
        code: 'CUSTOM_VALIDATION_FAILED',
      };
    }
  }
  return null;
};

const validateField = (
  fieldName: string,
  value: unknown,
  fieldSchema: ValidationSchema[string]
): { field: string; message: string; code: string }[] => {
  const errors: { field: string; message: string; code: string }[] = [];

  // Check required field
  const requiredError = validateRequiredField(fieldName, value, fieldSchema);
  if (requiredError) {
    errors.push(requiredError);
    return errors; // Skip other validations for missing required field
  }

  // Skip validation if field is not provided and not required
  if (value === undefined || value === null) {
    return errors;
  }

  // Type validation
  const typeError = validateFieldType(fieldName, value, fieldSchema);
  if (typeError) {
    errors.push(typeError);
    return errors; // Skip other validations for wrong type
  }

  // String validations
  if (typeof value === 'string') {
    errors.push(...validateStringField(fieldName, value, fieldSchema));
  }

  // Number validations
  if (typeof value === 'number') {
    errors.push(...validateNumberField(fieldName, value, fieldSchema));
  }

  // Array validations
  if (Array.isArray(value)) {
    errors.push(...validateArrayField(fieldName, value, fieldSchema));
  }

  // Allowed values validation
  const allowedValuesError = validateAllowedValues(fieldName, value, fieldSchema);
  if (allowedValuesError) {
    errors.push(allowedValuesError);
  }

  // Custom validation
  const customError = validateCustomRule(fieldName, value, fieldSchema);
  if (customError) {
    errors.push(customError);
  }

  return errors;
};

export const withCustomValidation = (
  schema: ValidationSchema,
  handler: RouteHandler
): RouteHandler => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    try {
      const currentBody = req.getBody() as Record<string, unknown>;
      const data = { ...req.data() } as Record<string, unknown>;

      // Apply defaults from schema into request body when missing
      for (const [fieldName, fieldSchema] of Object.entries(schema)) {
        if (
          (data[fieldName] === undefined || data[fieldName] === null) &&
          fieldSchema.default !== undefined
        ) {
          data[fieldName] = fieldSchema.default;
        }
      }

      // Persist defaults back into request body so downstream handlers see them
      req.setBody({ ...currentBody, ...data });
      const errors: Array<{ field: string; message: string; code: string }> = [];

      // Validate each field in the schema
      for (const [fieldName, fieldSchema] of Object.entries(schema)) {
        const value = data[fieldName];
        const fieldErrors = validateField(fieldName, value, fieldSchema);
        errors.push(...fieldErrors);
      }

      // Return errors if any validation failed
      if (errors.length > 0) {
        return res.setStatus(400).json({
          error: 'Validation failed',
          message: 'Request data validation failed',
          code: 'VALIDATION_FAILED',
          details: errors,
        });
      }

      return handler(req, res);
    } catch (error) {
      Logger.error('Custom validation failed', error);
      return res.setStatus(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_ERROR',
      });
    }
  };
};

/**
 * Predefined validation schemas for common use cases
 */
export const ValidationSchemas = {
  /**
   * Schema for pagination parameters
   */
  pagination: {
    page: {
      type: 'number' as const,
      min: 1,
      default: 1,
    },
    limit: {
      type: 'number' as const,
      min: 1,
      max: 100,
      default: 20,
    },
  },

  /**
   * Schema for date range filtering
   */
  dateRange: {
    startDate: {
      type: 'string' as const,
      pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    },
    endDate: {
      type: 'string' as const,
      pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
    },
  },

  /**
   * Schema for sorting parameters
   */
  sorting: {
    sortBy: {
      type: 'string' as const,
      allowedValues: ['name', 'status', 'createdAt', 'updatedAt', 'queueName'],
      default: 'createdAt',
    },
    sortOrder: {
      type: 'string' as const,
      allowedValues: ['asc', 'desc'],
      default: 'desc',
    },
  },

  /**
   * Schema for worker filtering
   */
  workerFilter: {
    status: {
      type: 'string' as const,
      allowedValues: ['running', 'stopped', 'failed', 'paused', ''],
      optional: true,
    },
    queueName: {
      type: 'string' as const,
      minLength: 3,
      maxLength: 50,
      optional: true,
    },
    driver: {
      type: 'string' as const,
      allowedValues: ['db', 'database', 'redis', 'memory', ''],
      optional: true,
    },
    search: {
      type: 'string' as const,
      maxLength: 100,
      optional: true,
    },
  },
};
