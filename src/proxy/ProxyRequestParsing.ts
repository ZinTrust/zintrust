import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyResponse } from '@proxy/ProxyBackend';
import { RequestValidator } from '@proxy/RequestValidator';

export const validateProxyRequest = (request: { method: string }): ProxyResponse | null => {
  const methodError = RequestValidator.requirePost(request.method);
  if (methodError) {
    return ErrorHandler.toProxyError(405, methodError.code, methodError.message);
  }
  return null;
};

export const parseJsonBody = (
  body: string
): { ok: true; value: Record<string, unknown> } | ProxyResponse => {
  const parsed = RequestValidator.parseJson(body);
  if (!parsed.ok) {
    return ErrorHandler.toProxyError(400, parsed.error.code, parsed.error.message);
  }
  return { ok: true, value: parsed.value };
};
