/* eslint-disable no-restricted-syntax */
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { PoolConfig } from '@runtime/durable-objects/PoolConfig';
import type { PoolDriver } from '@runtime/durable-objects/PoolDriver';
import { PoolRegistry } from '@runtime/durable-objects/PoolRegistry';

type DurableObjectState = {
  waitUntil: (promise: Promise<unknown>) => void;
  storage: {
    get: (key: string) => Promise<unknown>;
    put: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: () => Promise<{ keys: string[] }>;
    transaction: <T>(callback: (txn: unknown) => Promise<T>) => Promise<T>;
  };
  id: { toString: () => string };
};

type PoolRequestPayload = {
  command: string;
  params?: unknown[];
  method?: string;
};

const getDoRequestTimeoutMs = (env: Record<string, unknown>): number => {
  const raw = env['DO_REQUEST_TIMEOUT_MS'] ?? env['POOL_DO_TIMEOUT_MS'];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
};

const withTimeout = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> => {
  if (timeoutMs <= 0) return operation;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        ErrorFactory.createConnectionError(
          `PoolDurableObject timeout during ${context} after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

const parseConfig = (env: Record<string, unknown>): PoolConfig => {
  const driverRaw = (env['ZT_POOL_DRIVER'] ?? env['POOL_DRIVER'] ?? '').toString().trim();
  if (driverRaw === '') {
    throw ErrorFactory.createConfigError('PoolDurableObject: ZT_POOL_DRIVER is required');
  }

  const configRaw = (env['ZT_POOL_CONFIG_JSON'] ?? env['POOL_CONFIG_JSON'] ?? '').toString();
  if (configRaw.trim() === '') {
    return { driver: driverRaw, config: {} };
  }

  try {
    const parsed = JSON.parse(configRaw) as unknown;
    if (parsed === null || typeof parsed !== 'object') {
      throw ErrorFactory.createConfigError('PoolDurableObject: config JSON must be an object');
    }
    return { driver: driverRaw, config: parsed as Record<string, unknown> };
  } catch (error) {
    throw ErrorFactory.createConfigError(
      `PoolDurableObject: invalid config JSON (${String(error)})`
    );
  }
};

export class PoolDurableObject {
  private readonly env: Record<string, unknown>;
  private driver: PoolDriver | null = null;
  private initialized = false;

  constructor(_state: DurableObjectState, env: Record<string, unknown>) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const startedAt = Date.now();
    const timeoutMs = getDoRequestTimeoutMs(this.env);

    Logger.debug('[PoolDurableObject] Incoming request', {
      method: request.method,
      path: url.pathname,
      initialized: this.initialized,
      driver: this.driver?.name ?? null,
    });

    try {
      const methodError = this.validateMethod(request);
      if (methodError) return methodError;

      if (url.pathname === '/health') return await this.handleHealth();

      if (!this.isExecutePath(url.pathname)) {
        return jsonResponse(404, { code: 'NOT_FOUND', message: 'Unknown endpoint' });
      }

      const payload = await this.parsePayload(request);
      if (!payload.ok) return payload.response;

      await withTimeout(
        this.ensureInitialized(),
        timeoutMs,
        `${request.method} ${url.pathname} initialization`
      );

      if (!this.driver) {
        throw ErrorFactory.createConfigError('PoolDurableObject driver is not initialized');
      }

      const result = await withTimeout(
        this.driver.execute(payload.command, payload.params, payload.method),
        timeoutMs,
        `${request.method} ${url.pathname} execute`
      );
      Logger.debug('[PoolDurableObject] Request completed', {
        method: request.method,
        path: url.pathname,
        durationMs: Date.now() - startedAt,
        timeoutMs,
      });
      return jsonResponse(200, { ok: true, result });
    } catch (error) {
      Logger.error('[PoolDurableObject] Unhandled error', {
        path: url.pathname,
        method: request.method,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse(500, { code: 'DO_ERROR', message: String(error) });
    }
  }

  private validateMethod(request: Request): Response | null {
    if (request.method === 'POST') return null;
    return jsonResponse(405, { code: 'METHOD_NOT_ALLOWED', message: 'POST only' });
  }

  private isExecutePath(pathname: string): boolean {
    return pathname === '/execute' || pathname === '/query';
  }

  private async handleHealth(): Promise<Response> {
    const timeoutMs = getDoRequestTimeoutMs(this.env);
    Logger.debug('[PoolDurableObject] Handling health request');
    await withTimeout(this.ensureInitialized(), timeoutMs, 'POST /health initialization');

    if (!this.driver) {
      throw ErrorFactory.createConfigError('PoolDurableObject driver is not initialized');
    }

    const health = await withTimeout(this.driver.health(), timeoutMs, 'POST /health driver.health');
    Logger.debug('[PoolDurableObject] Health result', {
      connected: health?.connected ?? false,
      timeoutMs,
    });
    return jsonResponse(200, health ?? { connected: false });
  }

  private async parsePayload(
    request: Request
  ): Promise<
    | { ok: true; command: string; params: unknown[]; method?: string }
    | { ok: false; response: Response }
  > {
    try {
      const payload = (await request.json()) as (PoolRequestPayload & { sql?: string }) | null;
      const command = payload?.command ?? payload?.sql ?? '';
      if (command.trim() === '') {
        return {
          ok: false,
          response: jsonResponse(400, { code: 'INVALID_PAYLOAD', message: 'command is required' }),
        };
      }

      return {
        ok: true,
        command,
        params: Array.isArray(payload?.params) ? payload?.params : [],
        method: payload?.method,
      };
    } catch (error) {
      return {
        ok: false,
        response: jsonResponse(400, { code: 'INVALID_JSON', message: String(error) }),
      };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const config = parseConfig(this.env);
    Logger.info('[PoolDurableObject] Initializing driver', {
      driver: config.driver,
      hasConfig: Object.keys(config.config).length > 0,
    });

    const driver = PoolRegistry.get(config.driver);
    if (!driver) {
      throw ErrorFactory.createConfigError(
        `PoolDurableObject: driver '${config.driver}' not registered`
      );
    }

    await driver.initialize(config.config);
    this.driver = driver;
    this.initialized = true;

    Logger.info('[PoolDurableObject] Driver initialized', {
      driver: driver.name,
    });
  }
}
