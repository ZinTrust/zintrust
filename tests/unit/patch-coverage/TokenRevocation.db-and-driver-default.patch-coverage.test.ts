import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: TokenRevocation database + driver normalization', () => {
  it('normalizes unknown driver to default (database) and covers database branches', async () => {
    vi.resetModules();

    const loggerDebug = vi.fn();

    vi.doMock('@config/logger', () => ({
      Logger: {
        debug: loggerDebug,
      },
    }));

    const dbState = {
      firstCalls: 0,
      updateCalls: 0,
      insertCalls: 0,
      deleteCalls: 0,
      cleanupDeleteCalls: 0,
    };

    const makeDb = () => {
      const builder: any = {
        _field: '',
        _value: undefined as unknown,
        where(field: string, _op: string, value: unknown) {
          builder._field = field;
          builder._value = value;
          return builder;
        },
        async first() {
          dbState.firstCalls += 1;

          // 1) revoke existing branch
          if (dbState.firstCalls === 1) return { jti: 'id1', expires_at_ms: Date.now() + 10_000 };

          // 2) revoke insert branch
          if (dbState.firstCalls === 2) return null;

          // 3) isRevoked: non-finite branch
          if (dbState.firstCalls === 3) return { jti: 'id3', expires_at_ms: 'abc' };

          // 4) isRevoked: expired branch triggers delete
          if (dbState.firstCalls === 4) return { jti: 'id4', expires_at_ms: Date.now() - 1 };

          // otherwise: treat as not found
          return null;
        },
        async update() {
          dbState.updateCalls += 1;
          return 1;
        },
        async insert() {
          dbState.insertCalls += 1;
          // force one failure to cover logWarnBestEffort debug path
          throw new Error('insert failed');
        },
        async delete() {
          if (builder._field === 'expires_at_ms') dbState.cleanupDeleteCalls += 1;
          else dbState.deleteCalls += 1;
          return 1;
        },
      };

      return {
        table(_name: string) {
          return builder;
        },
      };
    };

    vi.doMock('@orm/Database', () => ({
      useDatabase: () => makeDb(),
    }));

    vi.doMock('@security/JwtManager', () => ({
      JwtManager: {
        create: () => ({
          decode: (token: string) => {
            if (token === 't1') return { exp: Math.floor(Date.now() / 1000) + 10, jti: 'id1' };
            if (token === 't2') return { exp: Math.floor(Date.now() / 1000) + 10, jti: 'id2' };
            if (token === 't3') return { exp: Math.floor(Date.now() / 1000) + 10, jti: 'id3' };
            if (token === 't4') return { exp: Math.floor(Date.now() / 1000) + 10, jti: 'id4' };
            return { exp: Math.floor(Date.now() / 1000) + 10, jti: token };
          },
        }),
      },
    }));

    const prev = process.env['JWT_REVOCATION_DRIVER'];
    process.env['JWT_REVOCATION_DRIVER'] = 'weird-driver';

    try {
      const { TokenRevocation } = await import('../../../src/index');
      TokenRevocation._resetForTests();

      // revoke: update existing
      await expect(TokenRevocation.revoke('Bearer t1')).resolves.toBe('t1');
      // revoke: insert branch triggers catch/log
      await expect(TokenRevocation.revoke('Bearer t2')).resolves.toBe('t2');

      // isRevoked: non-finite => true
      await expect(TokenRevocation.isRevoked('t3')).resolves.toBe(true);
      // isRevoked: expired => delete and false
      await expect(TokenRevocation.isRevoked('t4')).resolves.toBe(false);

      // hit maybeCleanup every 250th call
      for (let i = 0; i < 250; i += 1) {
        // id doesn't matter; builder returns null by default
        // eslint-disable-next-line no-await-in-loop
        await TokenRevocation.isRevoked(`x-${i}`);
      }

      expect(dbState.updateCalls).toBeGreaterThan(0);
      expect(dbState.insertCalls).toBeGreaterThan(0);
      expect(dbState.deleteCalls).toBeGreaterThan(0);
      expect(dbState.cleanupDeleteCalls).toBeGreaterThan(0);
      expect(loggerDebug).toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env['JWT_REVOCATION_DRIVER'];
      else process.env['JWT_REVOCATION_DRIVER'] = prev;
    }
  });
});
