import { databaseConfig } from '@/config/database';
import { describe, expect, it } from 'vitest';

describe('Database Config', () => {
  it('should have default connection', () => {
    expect(databaseConfig.default).toBeDefined();
  });

  it('should have connection definitions', () => {
    expect(databaseConfig.connections.sqlite).toBeDefined();
    expect(databaseConfig.connections.postgresql).toBeDefined();
    expect(databaseConfig.connections.mysql).toBeDefined();
  });

  it('should get current connection', () => {
    // Assuming default is sqlite or whatever Env.DB_CONNECTION is
    const conn = databaseConfig.getConnection();
    expect(conn).toBeDefined();
    expect(conn.driver).toBeDefined();
  });
});
