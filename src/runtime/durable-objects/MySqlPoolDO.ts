/* eslint-disable no-restricted-syntax */
import type { QueryResult } from '@/orm/DatabaseAdapter';
import { CloudflareSocket } from '@/sockets/CloudflareSocket';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

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

type MySqlPool = {
  execute: (sql: string, params: unknown[]) => Promise<[unknown]>;
  query: (sql: string, params: unknown[]) => Promise<[unknown]>;
  end: () => Promise<void>;
  createPool: (config: unknown) => MySqlPool;
};

/**
 * ZinTrustMySqlPoolDurableObject
 *
 * Maintains a persistent MySQL connection pool that allows multiple Worker requests
 * to execute queries without triggering cross-request I/O errors.
 */
export class ZinTrustMySqlPoolDurableObject {
  private readonly env: Record<string, unknown>;
  private mysqlModule: { createPool: (config: unknown) => MySqlPool } | null = null;

  constructor(_state: DurableObjectState, env: Record<string, unknown>) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      const url = new URL(request.url);

      switch (url.pathname) {
        case '/query':
          return await this.handleQuery(request);
        case '/health':
          return new Response(JSON.stringify({ connected: false }), { status: 200 });
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      Logger.error('[MySqlPoolDO] Unhandled error', error);
      return new Response(
        JSON.stringify({
          error: String(error),
          code: 'DO_ERROR',
        }),
        { status: 500 }
      );
    }
  }

  private async createPool(): Promise<MySqlPool> {
    Logger.info('[MySqlPoolDO] Initializing pool...');

    try {
      if (!this.mysqlModule) {
        const mysqlModule = await import('mysql2/promise');
        this.mysqlModule = mysqlModule.default as unknown as {
          createPool: (config: unknown) => MySqlPool;
        };
      }

      const createSocket = CloudflareSocket.create;
      const host = (this.env['DB_HOST'] as string) ?? Env.get('DB_HOST', '127.0.0.1');
      const port = Number(this.env['DB_PORT'] ?? Env.getInt('DB_PORT', 3306));
      const user = (this.env['DB_USERNAME'] as string) ?? Env.get('DB_USERNAME', 'root');
      const password = (this.env['DB_PASSWORD'] as string) ?? Env.get('DB_PASSWORD', '');
      const database = (this.env['DB_DATABASE'] as string) ?? Env.get('DB_DATABASE', 'zintrust');
      const tls = Boolean(this.env['DB_SSL'] === 'true');

      const pool = this.mysqlModule.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 1,
        namedPlaceholders: false,
        disableEval: true, // Critical for Workers
        // @ts-ignore
        stream: () => createSocket(host, port, tls),
      });

      await pool.execute('SELECT 1', []);
      Logger.info(`[MySqlPoolDO] Connected to ${host}:${port}`);
      return pool;
    } catch (error: unknown) {
      Logger.error('[MySqlPoolDO] Connection failed', error);
      throw error;
    }
  }

  private async handleQuery(request: Request): Promise<Response> {
    let pool: MySqlPool | null = null;
    try {
      pool = await this.createPool();

      const body = (await request.json()) as {
        sql: string;
        params?: unknown[];
        method?: 'query' | 'execute';
      };

      const { sql, params, method } = body;
      const queryParams = params ?? [];

      // Execute query using a per-request pool
      let result: QueryResult;
      if (method === 'execute') {
        const [res] = await pool.execute(sql, queryParams);
        result = this.normalizeResult(res);
      } else {
        const [rows] = await pool.query(sql, queryParams);
        result = this.normalizeResult(rows);
      }

      // Serialize BigInts
      const json =
        JSON.stringify(result, (_key: string, value: unknown): unknown =>
          typeof value === 'bigint' ? value.toString() : value
        ) ?? '{}';

      return new Response(json, { headers: { 'Content-Type': 'application/json' } });
    } catch (error: unknown) {
      const err = error as { message?: string | null; code?: string | null };
      return new Response(
        JSON.stringify({
          error: err.message ?? 'Unknown error',
          code: err.code ?? 'QUERY_ERROR',
        }) ?? '{}',
        { status: 500 }
      );
    } finally {
      if (pool) {
        try {
          await pool.end();
        } catch (error) {
          Logger.warn('[MySqlPoolDO] Failed to close pool', error);
        }
      }
    }
  }

  private normalizeResult(raw: unknown): QueryResult {
    if (Array.isArray(raw)) {
      return {
        rows: raw as Record<string, unknown>[],
        rowCount: raw.length,
      };
    }

    if (raw !== null && typeof raw === 'object') {
      const maybe = raw as { affectedRows?: unknown; insertId?: unknown };
      const affectedRows =
        typeof maybe.affectedRows === 'number' && Number.isFinite(maybe.affectedRows)
          ? maybe.affectedRows
          : 0;

      const insertId =
        (typeof maybe.insertId === 'number' ||
          typeof maybe.insertId === 'string' ||
          typeof maybe.insertId === 'bigint') &&
        maybe.insertId !== 0
          ? maybe.insertId
          : undefined;

      return { rows: [], rowCount: affectedRows, lastInsertId: insertId };
    }

    return { rows: [], rowCount: 0 };
  }
}
