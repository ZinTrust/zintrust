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
    try {
      const methodError = this.validateMethod(request);
      if (methodError) return methodError;

      const url = new URL(request.url);
      if (url.pathname === '/health') return await this.handleHealth();

      if (!this.isExecutePath(url.pathname)) {
        return jsonResponse(404, { code: 'NOT_FOUND', message: 'Unknown endpoint' });
      }

      const payload = await this.parsePayload(request);
      if (!payload.ok) return payload.response;

      await this.ensureInitialized();
      const result = await this.driver?.execute(payload.command, payload.params, payload.method);
      return jsonResponse(200, { ok: true, result });
    } catch (error) {
      Logger.error('[PoolDurableObject] Unhandled error', error);
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
    await this.ensureInitialized();
    const health = await this.driver?.health();
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
    const driver = PoolRegistry.get(config.driver);
    if (!driver) {
      throw ErrorFactory.createConfigError(
        `PoolDurableObject: driver '${config.driver}' not registered`
      );
    }

    await driver.initialize(config.config);
    this.driver = driver;
    this.initialized = true;
  }
}
