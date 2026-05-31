import { randomUUID } from 'node:crypto';
import type { ZedgiClientOptions, ZedgiServiceType } from './types.js';

type RpcResponse<T> = { ok: true; result: T; requestId: string | null; error: null } | { ok: false; error: { code: string; message: string; details?: unknown }; result?: never };

export const callZedgi = async <T = unknown>(
  options: ZedgiClientOptions,
  service: ZedgiServiceType,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> => {
  const url = new URL('/rpc', options.url);
  const body = JSON.stringify({ requestId: randomUUID(), service, method, payload });

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), options.timeout ?? 10_000);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-zedgi-key': options.key,
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timerId);
  }

  const parsed = await response.json() as RpcResponse<T>;

  if (!parsed.ok) {
    const err = new Error(parsed.error?.message ?? `Zedgi call failed (${response.status})`) as Error & { code?: string; statusCode?: number; details?: unknown };
    err.code = parsed.error?.code;
    err.statusCode = response.status;
    err.details = parsed.error?.details;
    throw err;
  }

  return parsed.result;
};
