import { ErrorFactory } from '@exceptions/ZintrustError';
import { isObject, isString } from '@helper/index';
import { EncryptedEnvelope } from '@security/EncryptedEnvelope';
import { type ISchema, Validator } from '@validation/Validator';

export type SecurePayloadDecryptor<TContext = unknown> = (
  raw: string,
  context?: TContext
) => Promise<string> | string;

export type SecurePayloadDecodeOptions<TContext = unknown> = {
  decryptor?: string | SecurePayloadDecryptor<TContext>;
  context?: TContext;
};

export type SecurePayloadCoercionType = 'string' | 'number' | 'integer' | 'boolean';

export type SecurePayloadCoercionShape = Record<string, SecurePayloadCoercionType>;

export type SecurePayloadPipelineStage = 'decrypt' | 'json' | 'coerce' | 'validate';

export type SecurePayloadPipelineIssue = {
  stage: SecurePayloadPipelineStage;
  message: string;
  details?: unknown;
};

export type SecurePayloadPipeline<TValue = unknown> = {
  decrypt(): SecurePayloadPipeline<TValue>;
  json<TNext = unknown>(): SecurePayloadPipeline<TNext>;
  coerce(shape: SecurePayloadCoercionShape): SecurePayloadPipeline<TValue>;
  validate(schema: ISchema): SecurePayloadPipeline<TValue>;
  value(): Promise<TValue>;
  typed<TNext = TValue>(): Promise<TNext>;
};

type SecurePayloadOperation =
  | { type: 'decrypt' }
  | { type: 'json' }
  | { type: 'coerce'; shape: SecurePayloadCoercionShape }
  | { type: 'validate'; schema: ISchema };

const decryptors = new Map<string, SecurePayloadDecryptor<unknown>>();

const createStageError = (
  stage: SecurePayloadPipelineStage,
  message: string,
  details?: unknown
): Error => {
  return ErrorFactory.createValidationError(`SecurePayload ${stage} failed: ${message}`, {
    stage,
    details,
  });
};

const resolveDecryptor = <TContext>(
  decryptor: string | SecurePayloadDecryptor<TContext> | undefined
): SecurePayloadDecryptor<TContext> => {
  if (typeof decryptor === 'function') {
    return decryptor;
  }

  if (typeof decryptor === 'string' && decryptor.trim().length > 0) {
    const registered = decryptors.get(decryptor) as SecurePayloadDecryptor<TContext> | undefined;
    if (registered) {
      return registered;
    }

    throw createStageError('decrypt', `Unknown decryptor: ${decryptor}`);
  }

  throw createStageError('decrypt', 'No decryptor was provided');
};

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }

  throw createStageError('coerce', 'Boolean coercion failed', { value });
};

const throwNumberCoercionError = (value: unknown, integer: boolean): never => {
  throw createStageError(
    'coerce',
    integer ? 'Integer coercion failed' : 'Numeric coercion failed',
    {
      value,
    }
  );
};

const coerceExistingNumber = (value: number, integer: boolean): number => {
  if (!Number.isFinite(value)) {
    throwNumberCoercionError(value, integer);
  }

  if (integer && !Number.isInteger(value)) {
    throwNumberCoercionError(value, true);
  }

  return value;
};

const coerceStringNumber = (value: string, integer: boolean): number => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throwNumberCoercionError(value, integer);
  }

  if (integer && !/^[-+]?\d+$/.test(trimmed)) {
    throwNumberCoercionError(value, true);
  }

  const parsed = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    throwNumberCoercionError(value, integer);
  }

  return parsed;
};

const coerceNumber = (value: unknown, integer = false): number => {
  if (typeof value === 'number') {
    return coerceExistingNumber(value, integer);
  }

  if (typeof value === 'string') {
    return coerceStringNumber(value, integer);
  }

  return throwNumberCoercionError(value, integer);
};

const coerceValue = (value: unknown, target: SecurePayloadCoercionType): unknown => {
  if (value === null || value === undefined) return value;

  if (target === 'string') {
    return isString(value) ? value : String(value);
  }

  if (target === 'number') {
    return coerceNumber(value, false);
  }

  if (target === 'integer') {
    return coerceNumber(value, true);
  }

  return coerceBoolean(value);
};

const applyCoercion = (input: unknown, shape: SecurePayloadCoercionShape): unknown => {
  if (!isObject(input)) {
    throw createStageError('coerce', 'Coercion requires a JSON object payload', {
      receivedType: Array.isArray(input) ? 'array' : typeof input,
    });
  }

  const output: Record<string, unknown> = { ...input };

  for (const [key, target] of Object.entries(shape)) {
    if (!(key in output)) continue;
    output[key] = coerceValue(output[key], target);
  }

  return output;
};

const validatePayload = (input: unknown, schema: ISchema): unknown => {
  if (!isObject(input)) {
    throw createStageError('validate', 'Validation requires an object payload', {
      receivedType: Array.isArray(input) ? 'array' : typeof input,
    });
  }

  try {
    return Validator.validate(input, schema);
  } catch (error) {
    if (error instanceof Error) {
      throw createStageError('validate', error.message, { cause: error.message });
    }

    throw createStageError('validate', 'Schema validation failed', { cause: error });
  }
};

const parseJson = (input: unknown): unknown => {
  if (!isString(input)) {
    throw createStageError('json', 'JSON parsing requires a string payload', {
      receivedType: Array.isArray(input) ? 'array' : typeof input,
    });
  }

  try {
    return JSON.parse(input);
  } catch (error) {
    throw createStageError('json', 'Invalid JSON payload', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

const decryptPayload = async <TContext>(
  input: unknown,
  options: SecurePayloadDecodeOptions<TContext>
): Promise<unknown> => {
  if (!isString(input)) {
    throw createStageError('decrypt', 'Encrypted payload must be a string', {
      receivedType: Array.isArray(input) ? 'array' : typeof input,
    });
  }

  const decryptor = resolveDecryptor(options.decryptor);

  try {
    return await decryptor(input, options.context);
  } catch (error) {
    if (error instanceof Error) {
      throw createStageError('decrypt', error.message, { cause: error.message });
    }

    throw createStageError('decrypt', 'Decryptor failed', { cause: error });
  }
};

const createPipeline = <TContext>(
  raw: string,
  options: SecurePayloadDecodeOptions<TContext>,
  operations: SecurePayloadOperation[] = []
): SecurePayloadPipeline => {
  const withOperation = (operation: SecurePayloadOperation): SecurePayloadPipeline => {
    return createPipeline(raw, options, [...operations, operation]);
  };

  const execute = async (): Promise<unknown> => {
    return operations.reduce<Promise<unknown>>(async (currentPromise, operation) => {
      const current = await currentPromise;

      if (operation.type === 'decrypt') {
        return decryptPayload(current, options);
      }

      if (operation.type === 'json') {
        return parseJson(current);
      }

      if (operation.type === 'coerce') {
        return applyCoercion(current, operation.shape);
      }

      return validatePayload(current, operation.schema);
    }, Promise.resolve(raw));
  };

  return Object.freeze({
    decrypt: () => withOperation({ type: 'decrypt' }),
    json: <TNext = unknown>() => withOperation({ type: 'json' }) as SecurePayloadPipeline<TNext>,
    coerce: (shape: SecurePayloadCoercionShape) => withOperation({ type: 'coerce', shape }),
    validate: (schema: ISchema) => withOperation({ type: 'validate', schema }),
    value: async () => execute(),
    typed: async <TNext = unknown>() => execute() as Promise<TNext>,
  });
};

export const SecurePayload = Object.freeze({
  registerDecryptor<TContext = unknown>(
    name: string,
    decryptor: SecurePayloadDecryptor<TContext>
  ): void {
    if (!isString(name) || name.trim().length === 0) {
      throw ErrorFactory.createValidationError('SecurePayload decryptor name must be provided');
    }

    decryptors.set(name.trim(), decryptor as SecurePayloadDecryptor<unknown>);
  },

  unregisterDecryptor(name: string): boolean {
    return decryptors.delete(name);
  },

  hasDecryptor(name: string): boolean {
    return decryptors.has(name);
  },

  listDecryptors(): string[] {
    return Array.from(decryptors.keys()).sort((left, right) => left.localeCompare(right));
  },

  clearDecryptors(): void {
    decryptors.clear();
  },

  createEnvelopeDecryptor(options: {
    cipher: Parameters<typeof EncryptedEnvelope.decryptString>[1]['cipher'];
    key: string;
    previousKeys?: string[];
  }): SecurePayloadDecryptor<unknown> {
    return (raw: string) =>
      EncryptedEnvelope.decryptString(raw, {
        cipher: options.cipher,
        key: options.key,
        previousKeys: options.previousKeys,
      });
  },

  decode<TContext = unknown>(
    raw: string,
    options: SecurePayloadDecodeOptions<TContext> = {}
  ): SecurePayloadPipeline {
    return createPipeline(raw, options);
  },
});

export default SecurePayload;
