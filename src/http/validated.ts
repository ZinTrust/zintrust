import type { IRequest } from '@http/Request';

type ValidatedShape = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
};

const getValidated = (req: IRequest): ValidatedShape | undefined => {
  return (req as unknown as { validated?: ValidatedShape }).validated;
};

export const validatedBody = <TBody = Record<string, unknown>>(
  req: IRequest
): TBody | undefined => {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.body === undefined) return undefined;
  return validated.body as TBody;
};

export const validatedQuery = <TQuery = Record<string, unknown>>(
  req: IRequest
): TQuery | undefined => {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.query === undefined) return undefined;
  return validated.query as TQuery;
};

export const validatedParams = <TParams = Record<string, unknown>>(
  req: IRequest
): TParams | undefined => {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.params === undefined) return undefined;
  return validated.params as TParams;
};

export const validatedHeaders = <THeaders = Record<string, unknown>>(
  req: IRequest
): THeaders | undefined => {
  const validated = getValidated(req);
  if (validated === undefined) return undefined;
  if (validated.headers === undefined) return undefined;
  return validated.headers as THeaders;
};

export const Validated = Object.freeze({
  body: validatedBody,
  query: validatedQuery,
  params: validatedParams,
  headers: validatedHeaders,
});
