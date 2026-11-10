import { SQLiteAdapter } from '@/orm/adapters/SQLiteAdapter';
import type { DatabaseConfig } from '@/orm/DatabaseAdapter';
import { describe, expect, it } from 'vitest';

// Skip these tests when native better-sqlite3 is not loadable in the test runtime (ABI mismatch)
let HAS_NATIVE_SQLITE = true;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DB = require('better-sqlite3');
  const conn = new DB(':memory:');
  conn.close();
} catch {
  HAS_NATIVE_SQLITE = false;
}

(HAS_NATIVE_SQLITE ? describe : describe.skip)('SQLiteAdapter', () => {
  const config: DatabaseConfig = {
    driver: 'sqlite',
    database: ':memory:',
  };
  const adapter = SQLiteAdapter.create(config);

  it('should connect successfully', async () => {
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
  });

  it('should disconnect successfully', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('should throw if querying when not connected', async () => {
    await expect(adapter.query('SELECT 1', [])).rejects.toThrow('Database not connected');
  });

  it('should return empty result for query', async () => {
    await adapter.connect();
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);
    const result = await adapter.query('SELECT * FROM users', []);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('should return null for queryOne', async () => {
    await adapter.connect();
    await adapter.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)', []);
    const result = await adapter.queryOne('SELECT * FROM users LIMIT 1', []);
    expect(result).toBeNull();
  });

  it('should execute transaction callback', async () => {
    await adapter.connect();
    const result = await adapter.transaction(async (_trx) => {
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('rolls back callback failures and applies a claim and effects only once', async () => {
    await adapter.connect();
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS settlement_claims (provider_reference TEXT UNIQUE, claim_token TEXT)',
      []
    );
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS settlement_accounts (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)',
      []
    );
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS settlement_ledger (provider_reference TEXT, amount INTEGER)',
      []
    );
    await adapter.query('DELETE FROM settlement_claims', []);
    await adapter.query('DELETE FROM settlement_ledger', []);
    await adapter.query('INSERT OR REPLACE INTO settlement_accounts (id, balance) VALUES (1, 0)', []);

    for (const failAfter of [1, 2, 3]) {
      // Each failure point must finish before the next rollback check begins.
      // eslint-disable-next-line no-await-in-loop
      await expect(
        adapter.transaction(async (trx) => {
          await trx.query(
            'INSERT INTO settlement_claims (provider_reference, claim_token) VALUES (?, ?) ON CONFLICT(provider_reference) DO NOTHING',
            [`failed-${failAfter}`, `token-${failAfter}`]
          );
          if (failAfter === 1) throw new Error('injected after claim');

          await trx.query(
            'UPDATE settlement_accounts SET balance = balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM settlement_claims WHERE provider_reference = ? AND claim_token = ?)',
            [10, 1, `failed-${failAfter}`, `token-${failAfter}`]
          );
          if (failAfter === 2) throw new Error('injected after balance');

          await trx.query(
            'INSERT INTO settlement_ledger (provider_reference, amount) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM settlement_claims WHERE provider_reference = ? AND claim_token = ?)',
            [`failed-${failAfter}`, 10, `failed-${failAfter}`, `token-${failAfter}`]
          );
          throw new Error('injected after ledger');
        })
      ).rejects.toThrow(/Transaction failed/i);
    }

    const failedClaims = await adapter.query('SELECT * FROM settlement_claims', []);
    const failedLedger = await adapter.query('SELECT * FROM settlement_ledger', []);
    const failedBalance = await adapter.queryOne('SELECT balance FROM settlement_accounts WHERE id = 1', []);
    expect(failedClaims.rows).toHaveLength(0);
    expect(failedLedger.rows).toHaveLength(0);
    expect(failedBalance?.['balance']).toBe(0);

    const settle = async (): Promise<boolean> =>
      adapter.transaction(async (trx) => {
        const claim = await trx.query(
          'INSERT INTO settlement_claims (provider_reference, claim_token) VALUES (?, ?) ON CONFLICT(provider_reference) DO NOTHING',
          ['provider-1', 'winner-token']
        );
        if (claim.rowCount === 0) return false;
        await trx.query(
          'UPDATE settlement_accounts SET balance = balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM settlement_claims WHERE provider_reference = ? AND claim_token = ?)',
          [50, 1, 'provider-1', 'winner-token']
        );
        await trx.query(
          'INSERT INTO settlement_ledger (provider_reference, amount) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM settlement_claims WHERE provider_reference = ? AND claim_token = ?)',
          ['provider-1', 50, 'provider-1', 'winner-token']
        );
        return true;
      });

    await expect(settle()).resolves.toBe(true);
    await expect(settle()).resolves.toBe(false);
    const settledBalance = await adapter.queryOne(
      'SELECT balance FROM settlement_accounts WHERE id = 1',
      []
    );
    const settledLedger = await adapter.query('SELECT * FROM settlement_ledger', []);
    expect(settledBalance?.['balance']).toBe(50);
    expect(settledLedger.rows).toHaveLength(1);
  });

  it('should get parameter placeholder for index', () => {
    const placeholder = adapter.getPlaceholder(1);
    expect(placeholder).toBe('?');
  });

  it('should get parameter placeholder for different indices', () => {
    expect(adapter.getPlaceholder(0)).toBe('?');
    expect(adapter.getPlaceholder(5)).toBe('?');
    expect(adapter.getPlaceholder(10)).toBe('?');
  });
});
