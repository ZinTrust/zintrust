import { Database, resetDatabase, useDatabase } from '@orm/Database';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    resetDatabase();
    db = new Database({ driver: 'sqlite', database: ':memory:' });
  });

  it('should create SQLite adapter by default', () => {
    expect(db.getType()).toBe('sqlite');
  });

  it('should connect to database', async () => {
    await db.connect();
    expect(db.isConnected()).toBe(true);
  });

  it('should disconnect from database', async () => {
    await db.connect();
    await db.disconnect();
    expect(db.isConnected()).toBe(false);
  });

  it('should throw error on query without connection', async () => {
    const query = db.query('SELECT * FROM users');
    expect(query).rejects.toThrow('Database not connected');
  });

  it('should use singleton instance', () => {
    const db1 = useDatabase();
    const db2 = useDatabase();
    expect(db1).toBe(db2);
  });

  it('should create table builder', () => {
    const builder = db.table('users');
    expect(builder).toBeDefined();
  });

  it('should get config', () => {
    const config = db.getConfig();
    expect(config.driver).toBe('sqlite');
    expect(config.database).toBe(':memory:');
  });
});
