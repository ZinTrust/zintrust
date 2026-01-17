import type { RouteRegistration, ValidationSchema } from '@routing/RouteRegistry';
import type { ISchema, ValidationRule } from '@validation/Validator';

type OpenApiSchema = {
  type?: string;
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: Array<string | number | boolean | null>;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [key: string]: unknown;
};

type OpenApiParameter = {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema: OpenApiSchema;
};

type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content: {
      'application/json': {
        schema: OpenApiSchema;
      };
    };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: {
        'application/json': {
          schema: OpenApiSchema;
        };
      };
    }
  >;
};

type OpenApiDocument = {
  openapi: '3.0.3';
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
};

export type OpenApiGeneratorOptions = {
  title: string;
  version: string;
  description?: string;
  serverUrl?: string;
  excludePaths?: readonly string[];
};

type RuleName = ValidationRule['rule'];

type FieldRuleSummary = {
  required: boolean;
  types: Set<RuleName>;
  constraints: Partial<
    Pick<OpenApiSchema, 'minimum' | 'maximum' | 'minLength' | 'maxLength' | 'pattern'>
  >;
  enumValues?: unknown[];
};

const resolveSchema = (schema: ValidationSchema): ISchema =>
  'getRules' in schema ? schema : schema.create();

const normalizeOpenApiPath = (path: string): { openApiPath: string; paramNames: string[] } => {
  const paramNames: string[] = [];
  const openApiPath = path.replaceAll(/:([a-zA-Z_]\w*)/g, (_match: string, name: string) => {
    paramNames.push(name);
    return `{${name}}`;
  });

  return { openApiPath, paramNames };
};

const replaceBracesSafely = (s: string): string => {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('{', i);
    if (start === -1) {
      out += s.slice(i);
      break;
    }
    const close = s.indexOf('}', start + 1);
    if (close === -1) {
      // No closing brace, append rest and stop.
      out += s.slice(i);
      break;
    }
    // Append text before '{'
    out += s.slice(i, start);
    // Extract the name between braces without using regex to avoid backtracking issues.
    const name = s.slice(start + 1, close);
    out += `_${name}_`;
    i = close + 1;
  }
  return out;
};

const trimUnderscores = (s: string): string => {
  let start = 0;
  let end = s.length - 1;
  while (start <= end && s.charAt(start) === '_') start++;
  while (end >= start && s.charAt(end) === '_') end--;
  return start > end ? '' : s.slice(start, end + 1);
};

const operationIdFrom = (method: string, path: string): string => {
  const intermediate = replaceBracesSafely(path).replaceAll(/\W+/g, '_');
  const safe = trimUnderscores(intermediate);
  return `${method.toLowerCase()}_${safe}`;
};

const summarizeRules = (rules: ValidationRule[]): FieldRuleSummary => {
  const summary: FieldRuleSummary = {
    required: false,
    types: new Set<RuleName>(),
    constraints: {},
  };

  const numericConstraintMap = {
    min: 'minimum',
    max: 'maximum',
    minLength: 'minLength',
    maxLength: 'maxLength',
  } as const;

  for (const r of rules) {
    summary.types.add(r.rule);

    if (r.rule === 'required') {
      summary.required = true;
      continue;
    }

    const numericKey = numericConstraintMap[r.rule as keyof typeof numericConstraintMap];
    if (numericKey && typeof r.value === 'number') {
      // numericKey is one of 'minimum'|'maximum'|'minLength'|'maxLength', so assigning a number is safe
      summary.constraints[numericKey] = r.value;
      continue;
    }

    if (r.rule === 'regex' && r.value instanceof RegExp) {
      summary.constraints.pattern = r.value.source;
      continue;
    }

    if (r.rule === 'in' && Array.isArray(r.value)) {
      summary.enumValues = r.value;
    }
  }

  return summary;
};

const openApiTypeFor = (types: Set<RuleName>): { type?: string; format?: string } => {
  if (types.has('boolean')) return { type: 'boolean' };
  if (types.has('integer') || types.has('digits')) return { type: 'integer' };
  if (types.has('number') || types.has('decimal') || types.has('positiveNumber'))
    return { type: 'number' };
  if (types.has('array')) return { type: 'array' };

  if (types.has('uuid')) return { type: 'string', format: 'uuid' };
  if (types.has('email')) return { type: 'string', format: 'email' };
  if (types.has('url')) return { type: 'string', format: 'uri' };
  if (types.has('ipAddress')) return { type: 'string', format: 'ipv4' };
  if (types.has('date')) return { type: 'string', format: 'date-time' };

  if (types.size > 0) return { type: 'string' };
  return {};
};

const schemaToOpenApi = (schema: ValidationSchema): OpenApiSchema => {
  const s = resolveSchema(schema);
  const rules = s.getRules();

  const properties: Record<string, OpenApiSchema> = {};
  const required: string[] = [];

  for (const [field, fieldRules] of rules.entries()) {
    const summary = summarizeRules(fieldRules);
    const base = openApiTypeFor(summary.types);

    const out: OpenApiSchema = {
      ...base,
      ...summary.constraints,
    };

    if (summary.enumValues !== undefined) {
      // Only include enum values that are JSON-serializable primitives.
      const primitives = summary.enumValues.filter(
        (v) =>
          v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      );
      if (primitives.length > 0) out.enum = primitives;
    }

    if (out.type === 'array') {
      // We don't have element typing information in Validator today.
      out.items = {};
    }

    properties[field] = out;
    if (summary.required) required.push(field);
  }

  const obj: OpenApiSchema = {
    type: 'object',
    properties,
  };

  if (required.length > 0) obj.required = required;

  return obj;
};

const fieldSchemasFromSchema = (schema: ValidationSchema): Record<string, OpenApiSchema> => {
  const s = resolveSchema(schema);
  const rules = s.getRules();

  const out: Record<string, OpenApiSchema> = {};

  for (const [field, fieldRules] of rules.entries()) {
    const summary = summarizeRules(fieldRules);
    const typeInfo = openApiTypeFor(summary.types);

    const schemaOut: OpenApiSchema = {
      ...typeInfo,
      ...summary.constraints,
    };

    if (summary.enumValues !== undefined) {
      const primitives = summary.enumValues.filter(
        (v) =>
          v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      );
      if (primitives.length > 0) schemaOut.enum = primitives;
    }

    if (schemaOut.type === 'array') {
      schemaOut.items = {};
    }

    out[field] = schemaOut;
  }

  return out;
};

const parametersFromSchema = (
  schema: ValidationSchema,
  location: 'query' | 'header'
): OpenApiParameter[] => {
  const s = resolveSchema(schema);
  const rules = s.getRules();

  const params: OpenApiParameter[] = [];

  for (const [field, fieldRules] of rules.entries()) {
    const summary = summarizeRules(fieldRules);
    const typeInfo = openApiTypeFor(summary.types);

    const schemaOut: OpenApiSchema = {
      ...typeInfo,
      ...summary.constraints,
    };

    if (summary.enumValues !== undefined) {
      const primitives = summary.enumValues.filter(
        (v) =>
          v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      );
      if (primitives.length > 0) schemaOut.enum = primitives;
    }

    params.push({
      name: field,
      in: location,
      required: summary.required,
      schema: schemaOut,
    });
  }

  return params;
};

const buildPathParameters = (
  paramNames: string[],
  paramSchemas?: Record<string, OpenApiSchema>
): OpenApiParameter[] =>
  paramNames.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: paramSchemas?.[name] ?? { type: 'string' },
  }));

const buildOperationParameters = (
  meta: RouteRegistration['meta'] | undefined,
  paramNames: string[],
  paramSchemas?: Record<string, OpenApiSchema>
): OpenApiParameter[] | undefined => {
  const parameters: OpenApiParameter[] = [];

  parameters.push(...buildPathParameters(paramNames, paramSchemas));

  if (meta?.request?.querySchema !== undefined) {
    parameters.push(...parametersFromSchema(meta.request.querySchema, 'query'));
  }

  if (meta?.request?.headersSchema !== undefined) {
    parameters.push(...parametersFromSchema(meta.request.headersSchema, 'header'));
  }

  return parameters.length > 0 ? parameters : undefined;
};

const buildOperationResponses = (
  meta: RouteRegistration['meta'] | undefined
): Record<
  string,
  { description: string; content?: { 'application/json': { schema: OpenApiSchema } } }
> => {
  // Default response
  if (
    meta?.response === undefined ||
    (meta.response.schema === undefined && meta.response.status === undefined)
  ) {
    return {
      '200': {
        description: 'OK',
      },
    };
  }

  const status = String(meta.response.status ?? 200);
  return {
    [status]: {
      description: status === '204' ? 'No Content' : 'OK',
      ...(meta.response.schema === undefined
        ? {}
        : {
            content: {
              'application/json': {
                schema: meta.response.schema as OpenApiSchema,
              },
            },
          }),
    },
  };
};

const createOperation = (
  meta: RouteRegistration['meta'] | undefined,
  method: string,
  openApiPath: string,
  paramNames: string[],
  paramSchemas?: Record<string, OpenApiSchema>
): OpenApiOperation => {
  const responses = buildOperationResponses(meta);
  const parameters = buildOperationParameters(meta, paramNames, paramSchemas);

  const op: OpenApiOperation = {
    summary: meta?.summary,
    description: meta?.description,
    tags: meta?.tags ? Array.from(meta.tags) : undefined,
    operationId: operationIdFrom(method, openApiPath),
    responses,
  };

  if (parameters !== undefined) op.parameters = parameters;

  if (meta?.request?.bodySchema !== undefined) {
    op.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: schemaToOpenApi(meta.request.bodySchema),
        },
      },
    };
  }

  return op;
};

export const OpenApiGenerator = Object.freeze({
  generate(routes: RouteRegistration[], options: OpenApiGeneratorOptions): OpenApiDocument {
    const excluded = new Set(options.excludePaths ?? []);

    const doc: OpenApiDocument = {
      openapi: '3.0.3',
      info: {
        title: options.title,
        version: options.version,
        description: options.description,
      },
      paths: Object.create(null),
    };

    if (typeof options.serverUrl === 'string' && options.serverUrl.trim() !== '') {
      doc.servers = [{ url: options.serverUrl.trim() }];
    }

    for (const r of routes) {
      if (excluded.has(r.path)) continue;

      const { openApiPath, paramNames } = normalizeOpenApiPath(r.path);
      const method = r.method.toLowerCase();

      if (!Object.prototype.hasOwnProperty.call(doc.paths, openApiPath)) {
        doc.paths[openApiPath] = Object.create(null);
      }

      const meta = r.meta;

      const paramSchemas =
        meta?.request?.paramsSchema === undefined
          ? undefined
          : fieldSchemasFromSchema(meta.request.paramsSchema);

      const op = createOperation(meta, method, openApiPath, paramNames, paramSchemas);

      doc.paths[openApiPath][method] = op;
    }

    return doc;
  },
});

export default OpenApiGenerator;
