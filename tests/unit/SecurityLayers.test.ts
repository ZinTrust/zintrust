/**
 * Security Layers Test Suite
 * Tests key layers of the defense-in-depth architecture
 */

import { QueryBuilder } from '@orm/QueryBuilder';
import { Sanitizer } from '@security/Sanitizer';
import { XssProtection } from '@security/XssProtection';
import { Schema, Validator } from '@validation/Validator';
import { describe, expect, it, vi } from 'vitest';

describe('Security Layers - Defense-in-Depth', () => {
  describe('Layer 5: XSS Sanitization', () => {
    it('should strip HTML tags from malicious input', () => {
      const malicious = '<script>alert("XSS")</script>Hello';
      const sanitized = XssProtection.sanitize(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should handle nested XSS payloads', () => {
      const nested = '<div><script>alert(1)</script><img src=x onerror=alert(2)></div>';
      const sanitized = XssProtection.sanitize(nested);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('onerror');
    });

    it('should sanitize string inputs', () => {
      const text = '<script>alert(1)</script>John';
      const sanitized = XssProtection.sanitize(text);
      expect(typeof sanitized).toBe('string');
      expect(sanitized).not.toContain('<script>');
    });
  });

  describe('Layer 6: Field Sanitization', () => {
    it('should sanitize email addresses', () => {
      const dirty = ' USER@EXAMPLE.COM ';
      const clean = Sanitizer.email(dirty);
      expect(clean.toLowerCase()).toContain('@example.com');
    });

    it('should sanitize name text', () => {
      const dirty = '  John Doe  ';
      const clean = Sanitizer.nameText(dirty);
      expect(clean).toContain('John');
    });

    it('should sanitize safe password characters', () => {
      const dirty = 'Pass123!';
      const clean = Sanitizer.safePasswordChars(dirty);
      expect(clean.length).toBeGreaterThan(0);
    });

    it('should handle alphanumeric sanitization', () => {
      const dirty = 'abc123xyz';
      const clean = Sanitizer.alphanumeric(dirty);
      expect(clean).toBe('abc123xyz');
    });
  });

  describe('Layer 7: Schema Validation', () => {
    it('should reject missing required fields', () => {
      const schema = Schema.create().required('email').required('password');

      const validationFn = () => Validator.validate({ email: 'test@example.com' }, schema);
      expect(validationFn).toThrow();
    });

    it('should reject invalid email format', () => {
      const schema = Schema.create().email('email');

      const validationFn = () => Validator.validate({ email: 'invalid-email' }, schema);
      expect(validationFn).toThrow();
    });

    it('should reject string length violations', () => {
      const schema = Schema.create().minLength('password', 8);

      const validationFn = () => Validator.validate({ password: 'short' }, schema);
      expect(validationFn).toThrow();
    });

    it('should pass valid data through validation', () => {
      const schema = Schema.create().email('email').minLength('password', 8);

      const validationFn = () =>
        Validator.validate(
          {
            email: 'test@example.com',
            password: 'SecurePass123!',
          },
          schema
        );
      expect(validationFn).not.toThrow();
    });
  });

  describe('Layer 10: SQL Injection Prevention', () => {
    it('should use parameterized queries in QueryBuilder', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue([{ id: 1, email: 'test@example.com' }]),
      };

      const builder = QueryBuilder.create('users', mockDb as never);
      const maliciousEmail = "test@example.com' OR '1'='1";

      await builder.where('email', maliciousEmail).first();

      // Verify parameterized query was used
      expect(mockDb.query).toHaveBeenCalled();
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('?'); // Parameterized placeholder
      expect(params).toContain(maliciousEmail); // Parameter passed separately
      expect(sql).not.toContain("' OR '1'='1"); // No inline injection
    });

    it('should prevent SQL injection in WHERE IN clauses', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      };

      const builder = QueryBuilder.create('users', mockDb as never);
      const maliciousIds = ["1' OR '1'='1", '2'];

      await builder.whereIn('id', maliciousIds).get();

      expect(mockDb.query).toHaveBeenCalled();
      const [sql, params] = mockDb.query.mock.calls[0];
      expect(sql).toContain('?'); // Parameterized placeholders
      expect(params).toEqual(expect.arrayContaining(maliciousIds)); // Parameters passed separately
    });
  });

  describe('Integration: Multi-Layer Protection', () => {
    it('should apply sanitization before validation', () => {
      // Sanitize input
      const email = Sanitizer.email('  dirty@example.com  ');
      const password = Sanitizer.safePasswordChars('Pass123!Extra');

      // After sanitization, should pass validation
      const schema = Schema.create().email('email').minLength('password', 8);

      const validationFn = () => Validator.validate({ email, password }, schema);
      expect(validationFn).not.toThrow();

      expect(email).toContain('@example.com');
    });

    it('should reject after sanitization if validation fails', () => {
      const email = Sanitizer.email('  invalid-email  ', false);
      const schema = Schema.create().email('email');

      const validationFn = () => Validator.validate({ email }, schema);
      expect(validationFn).toThrow();
    });
  });

  describe('Defense-in-Depth Guarantees', () => {
    it('should demonstrate layered rejection scenarios', () => {
      // XSS attempt - Layer 5 blocks
      const xssPayload = '<script>alert(1)</script>';
      const xssCleaned = XssProtection.sanitize(xssPayload);
      expect(xssCleaned).not.toContain('<script>');

      // SQL injection attempt - Layer 10 prevents via parameterization
      const sqlInjection = "' OR '1'='1";
      const mockDb = { query: vi.fn().mockResolvedValue([]) };
      const builder = QueryBuilder.create('users', mockDb as never);
      builder.where('email', sqlInjection);
      const sql = builder.toSQL();
      const params = builder.getParameters();
      expect(sql).toContain('?');
      expect(params).toContain(sqlInjection);
      expect(sql).not.toContain("' OR '1'='1");

      // Invalid data - Layer 7 blocks
      const schema = Schema.create().email('email');
      const validationFn = () => Validator.validate({ email: 'not-an-email' }, schema);
      expect(validationFn).toThrow();
    });
  });
});
