import { describe, expect, it, vi } from 'vitest';

const poolConfig: Array<Record<string, unknown>> = [];

vi.mock('mysql2/promise', () => {
  return {
    createPool: (config: Record<string, unknown>) => {
      poolConfig.push(config);
      return {
        execute: async () => [[], []],
        end: async () => undefined,
        getConnection: async () => ({
          execute: async () => [[], []],
          beginTransaction: async () => undefined,
          commit: async () => undefined,
          rollback: async () => undefined,
          release: () => undefined,
        }),
      };
    },
  };
});

vi.mock('@zintrust/core', async () => {
  const actual = await vi.importActual<typeof import('@zintrust/core')>('@zintrust/core');
  return {
    ...actual,
    CloudflareSocket: {
      create: () => ({}) as unknown,
    },
  };
});

import { MySQLAdapter } from '../../../../packages/db-mysql/src/index';

describe('MySQL adapter (Workers)', () => {
  it('parses connection string and uses stream option in Workers', async () => {
    const injectedMysqlModule = {
      createPool: (config: Record<string, unknown>) => {
        poolConfig.push(config);
        return {
          execute: async () => [[], []],
          end: async () => undefined,
          getConnection: async () => ({
            execute: async () => [[], []],
            beginTransaction: async () => undefined,
            commit: async () => undefined,
            rollback: async () => undefined,
            release: () => undefined,
          }),
        };
      },
    };
    (globalThis as unknown as { __zintrustMysqlModule?: unknown }).__zintrustMysqlModule =
      injectedMysqlModule;

    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = {
      ENABLE_CLOUDFLARE_SOCKETS: 'true',
    };

    const adapter = MySQLAdapter.create({
      driver: 'mysql',
      connectionString: 'mysql://user:pass@db.example.com:3306/app',
    });

    await adapter.connect();

    const lastConfig = poolConfig[poolConfig.length - 1];
    expect(lastConfig.host).toBe('db.example.com');
    expect(lastConfig.port).toBe(3306);
    expect(lastConfig.database).toBe('app');
    expect(lastConfig.user).toBe('user');
    expect(lastConfig.password).toBe('pass');
    expect(lastConfig.stream).toBeTypeOf('function');

    await adapter.disconnect();

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }

    delete (globalThis as unknown as { __zintrustMysqlModule?: unknown }).__zintrustMysqlModule;
  });
});
