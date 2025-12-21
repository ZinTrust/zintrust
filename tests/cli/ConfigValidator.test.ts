/**
 * ConfigValidator Tests
 */

import { DEFAULT_CONFIG } from '@cli/config/ConfigSchema';
import { ConfigValidator, ValidationResult } from '@cli/config/ConfigValidator';
import { describe, expect, it } from 'vitest';

describe('ConfigValidator Basic Validation', () => {
  it('should validate correct config', () => {
    const result = ConfigValidator.validate(DEFAULT_CONFIG);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid port number (too low)', () => {
    const config = { ...DEFAULT_CONFIG, server: { ...DEFAULT_CONFIG.server, port: 500 } };
    const result = ConfigValidator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].key).toBe('server.port');
  });

  it('should detect invalid port number (too high)', () => {
    const config = { ...DEFAULT_CONFIG, server: { ...DEFAULT_CONFIG.server, port: 70000 } };
    const result = ConfigValidator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should detect invalid environment', () => {
    const config = {
      ...DEFAULT_CONFIG,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server: { ...DEFAULT_CONFIG.server, environment: 'staging' as any },
    };
    const result = ConfigValidator.validate(config);

    expect(result.valid).toBe(false);
    expect(result.errors[0].rule).toBe('enum');
  });

  it('should detect invalid database connection', () => {
    const config = {
      ...DEFAULT_CONFIG,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      database: { ...DEFAULT_CONFIG.database, connection: 'oracle' as any },
    };
    const result = ConfigValidator.validate(config);

    expect(result.valid).toBe(false);
  });
});

describe('ConfigValidator Value Validation', () => {
  it('should validate single value correctly', () => {
    const error = ConfigValidator.validateValue('server.port', 3000);
    expect(error).toBeNull();
  });

  it('should reject single value with invalid type', () => {
    const error = ConfigValidator.validateValue('server.port', 'not-a-number');
    expect(error).not.toBeNull();
    expect(error?.rule).toBe('type');
  });

  it('should reject single value outside range', () => {
    const error = ConfigValidator.validateValue('server.port', 99999);
    expect(error).not.toBeNull();
    expect(error?.rule).toBe('max');
  });

  it('should validate name pattern', () => {
    const validError = ConfigValidator.validateValue('name', 'valid-app-123');
    expect(validError).toBeNull();

    const invalidError = ConfigValidator.validateValue('name', 'invalid app@123');
    expect(invalidError).not.toBeNull();
    expect(invalidError?.rule).toBe('pattern');
  });

  it('should validate version format', () => {
    const validError = ConfigValidator.validateValue('version', '1.0.0');
    expect(validError).toBeNull();

    const validError2 = ConfigValidator.validateValue('version', '2.5.10-beta');
    expect(validError2).toBeNull();

    const invalidError = ConfigValidator.validateValue('version', 'latest');
    expect(invalidError).not.toBeNull();
  });
});

describe('ConfigValidator Formatting and Metadata', () => {
  it('should format validation errors for display', () => {
    const config = { ...DEFAULT_CONFIG, server: { ...DEFAULT_CONFIG.server, port: 500 } };
    const result = ConfigValidator.validate(config);

    const formatted = ConfigValidator.formatErrors(result);
    expect(formatted).toContain('Configuration validation failed');
    expect(formatted).toContain('❌');
  });

  it('should format valid result', () => {
    const result: ValidationResult = { valid: true, errors: [] };
    const formatted = ConfigValidator.formatErrors(result);
    expect(formatted).toContain('valid');
  });

  it('should get description for config key', () => {
    const desc = ConfigValidator.getDescription('server.port');
    expect(desc).toBeDefined();
    expect(desc).toContain('port');
  });

  it('should return undefined for unknown key description', () => {
    const desc = ConfigValidator.getDescription('unknown.key');
    expect(desc).toBeUndefined();
  });

  it('should validate enum values', () => {
    const validJwt = ConfigValidator.validateValue('auth.strategy', 'jwt');
    expect(validJwt).toBeNull();

    const invalidStrategy = ConfigValidator.validateValue('auth.strategy', 'oauth');
    expect(invalidStrategy).not.toBeNull();
    expect(invalidStrategy?.rule).toBe('enum');
  });

  it('should validate required values', () => {
    const error = ConfigValidator.validateValue('name', undefined);
    expect(error).not.toBeNull();
    expect(error?.rule).toBe('required');
  });

  it('should handle null values', () => {
    const error = ConfigValidator.validateValue('name', null);
    expect(error).not.toBeNull();
    expect(error?.rule).toBe('required');
  });
});
