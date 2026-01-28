import type { ISchema, SchemaType } from '@validation/Validator';

export type ValidationSchema = ISchema | SchemaType;

export type RouteMetaInput =
  | RouteMeta
  | {
      summary?: string;
      description?: string;
      tags?: readonly string[];
      requestSchema?: ValidationSchema;
      responseSchema?: unknown;
      responseStatus?: number;
    };

export type RouteMeta = {
  summary?: string;
  description?: string;
  tags?: readonly string[];

  request?: {
    bodySchema?: ValidationSchema;
    querySchema?: ValidationSchema;
    paramsSchema?: ValidationSchema;
    headersSchema?: ValidationSchema;
  };

  response?: {
    status?: number;
    schema?: unknown;
  };
};

export type RouteRegistration = {
  method: string;
  path: string;
  middleware?: readonly string[];
  meta?: RouteMeta;
};

export const normalizeRouteMeta = (input?: RouteMetaInput): RouteMeta | undefined => {
  if (input === undefined) return undefined;

  // If it already looks like the normalized shape, return as-is.
  if (
    typeof input === 'object' &&
    input !== null &&
    ('request' in input || 'response' in input || 'summary' in input || 'tags' in input)
  ) {
    const any = input as RouteMeta;
    return any;
  }

  const any = input as {
    summary?: string;
    description?: string;
    tags?: readonly string[];
    requestSchema?: ValidationSchema;
    responseSchema?: unknown;
    responseStatus?: number;
  };

  return {
    summary: any.summary,
    description: any.description,
    tags: any.tags,
    request:
      any.requestSchema === undefined
        ? undefined
        : {
            bodySchema: any.requestSchema,
          },
    response:
      any.responseSchema === undefined && any.responseStatus === undefined
        ? undefined
        : {
            status: any.responseStatus,
            schema: any.responseSchema,
          },
  };
};

type RouteRegistryState = {
  routes: RouteRegistration[];
};

const state: RouteRegistryState = {
  routes: [],
};

export const RouteRegistry = Object.freeze({
  record(route: RouteRegistration): void {
    state.routes.push(route);
  },

  list(): readonly RouteRegistration[] {
    // Return readonly reference to avoid unnecessary array cloning
    return state.routes;
  },

  clear(): void {
    state.routes.length = 0;
  },
});

export default RouteRegistry;
