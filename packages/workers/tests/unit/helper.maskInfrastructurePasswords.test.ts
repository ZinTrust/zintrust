import { describe, expect, it } from 'vitest';
import { maskInfrastructurePasswords } from '../../src/helper';

describe('maskInfrastructurePasswords', () => {
  it('should return null when infrastructure is null', () => {
    const result = maskInfrastructurePasswords(null);
    expect(result).toBeNull();
  });

  it('should return null when infrastructure is undefined', () => {
    const result = maskInfrastructurePasswords(undefined);
    expect(result).toBeNull();
  });

  it('should mask Redis password when present', () => {
    const infrastructure = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        password: 'secret123',
      },
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect(result).not.toBeNull();
    expect(result?.['redis']).toBeDefined();
    expect((result?.['redis'] as Record<string, unknown>)?.['password']).toBe('******');
    expect((result?.['redis'] as Record<string, unknown>)?.['host']).toBe('localhost');
    expect((result?.['redis'] as Record<string, unknown>)?.['port']).toBe(6379);
    expect((result?.['redis'] as Record<string, unknown>)?.['db']).toBe(0);
  });

  it('should not modify Redis password when it is empty string', () => {
    const infrastructure = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        password: '',
      },
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect((result?.['redis'] as Record<string, unknown>)?.['password']).toBe('');
  });

  it('should mask database password in persistence configuration', () => {
    const infrastructure = {
      persistence: {
        driver: 'database',
        password: 'dbSecret456',
      },
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect((result?.['persistence'] as Record<string, unknown>)?.['password']).toBe('******');
  });

  it('should mask database password in connection object', () => {
    const infrastructure = {
      persistence: {
        driver: 'database',
        connection: {
          host: 'localhost',
          password: 'connectionSecret789',
        },
      },
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect(
      (
        (result?.['persistence'] as Record<string, unknown>)?.['connection'] as Record<
          string,
          unknown
        >
      )?.['password']
    ).toBe('******');
    expect(
      (
        (result?.['persistence'] as Record<string, unknown>)?.['connection'] as Record<
          string,
          unknown
        >
      )?.['host']
    ).toBe('localhost');
  });

  it('should mask both Redis and database passwords when both present', () => {
    const infrastructure = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        password: 'redisSecret',
      },
      persistence: {
        driver: 'database',
        password: 'dbSecret',
        connection: {
          host: 'db-host',
          password: 'connectionSecret',
        },
      },
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect((result?.['redis'] as Record<string, unknown>)?.['password']).toBe('******');
    expect((result?.['persistence'] as Record<string, unknown>)?.['password']).toBe('******');
    expect(
      (
        (result?.['persistence'] as Record<string, unknown>)?.['connection'] as Record<
          string,
          unknown
        >
      )?.['password']
    ).toBe('******');
  });

  it('should preserve other infrastructure fields', () => {
    const infrastructure = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        password: 'secret',
      },
      persistence: {
        driver: 'database',
      },
      deadLetterQueue: {
        policy: 'expire',
      },
      otherField: 'value',
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect((result?.['redis'] as Record<string, unknown>)?.['password']).toBe('******');
    expect((result?.['persistence'] as Record<string, unknown>)?.['driver']).toBe('database');
    expect((result?.['deadLetterQueue'] as Record<string, unknown>)?.['policy']).toBe('expire');
    expect(result?.['otherField']).toBe('value');
  });

  it('should handle infrastructure without redis or persistence', () => {
    const infrastructure = {
      deadLetterQueue: {
        policy: 'expire',
      },
    };

    const result = maskInfrastructurePasswords(infrastructure);

    expect((result?.['deadLetterQueue'] as Record<string, unknown>)?.['policy']).toBe('expire');
  });
});
