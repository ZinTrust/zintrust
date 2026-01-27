/**
 * Unit Tests for DeduplicationBuilder
 */

import { createDeduplicationBuilder } from '@tools/queue/DeduplicationBuilder';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DeduplicationBuilder', () => {
  let builder: ReturnType<typeof createDeduplicationBuilder>;

  beforeEach(() => {
    builder = createDeduplicationBuilder();
  });

  it('should create a builder instance', () => {
    expect(builder).toBeDefined();
    expect(typeof builder.id).toBe('function');
    expect(typeof builder.expireAfter).toBe('function');
    expect(typeof builder.dontRelease).toBe('function');
    expect(typeof builder.replace).toBe('function');
    expect(typeof builder.releaseAfter).toBe('function');
    expect(typeof builder.build).toBe('function');
  });

  it('should require ID before building', () => {
    expect(() => builder.build()).toThrow('Deduplication ID is required');
  });

  it('should build with just ID', () => {
    const options = builder.id('test-id').build();

    expect(options).toEqual({
      id: 'test-id',
    });
  });

  describe('Fluent Interface', () => {
    it('should support method chaining', () => {
      const options = builder.id('test-id').expireAfter(5000).dontRelease().replace().build();

      expect(options).toEqual({
        id: 'test-id',
        ttl: 5000,
        dontRelease: true,
        replace: true,
      });
    });

    it('should support releaseAfter with delay', () => {
      const options = builder.id('test-id').expireAfter(10000).releaseAfter(30000).build();

      expect(options).toEqual({
        id: 'test-id',
        ttl: 10000,
        releaseAfter: 30000,
      });
    });

    it('should support releaseAfter with condition', () => {
      const condition = {
        condition: 'job.result.status === "completed"',
        delay: 5000,
      };

      const options = builder.id('test-id').releaseAfter(condition).build();

      expect(options).toEqual({
        id: 'test-id',
        releaseAfter: condition,
      });
    });

    it('should support releaseAfter with success string', () => {
      const options = builder.id('test-id').releaseAfter('success').build();

      expect(options).toEqual({
        id: 'test-id',
        releaseAfter: 'success',
      });
    });
  });

  describe('Method Behaviors', () => {
    it('should set TTL correctly', () => {
      const options = builder.id('test-id').expireAfter(12345).build();
      expect(options.ttl).toBe(12345);
    });

    it('should set dontRelease flag', () => {
      const options = builder.id('test-id').dontRelease().build();
      expect(options.dontRelease).toBe(true);
    });

    it('should set replace flag', () => {
      const options = builder.id('test-id').replace().build();
      expect(options.replace).toBe(true);
    });

    it('should handle multiple method calls', () => {
      const options = builder
        .id('test-id')
        .expireAfter(1000)
        .dontRelease()
        .replace()
        .expireAfter(2000) // Should override previous TTL
        .build();

      expect(options).toEqual({
        id: 'test-id',
        ttl: 2000,
        dontRelease: true,
        replace: true,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string ID', () => {
      const options = builder.id('').build();
      expect(options.id).toBe('');
    });

    it('should handle zero TTL', () => {
      const options = builder.id('test-id').expireAfter(0).build();
      expect(options.ttl).toBe(0);
    });

    it('should handle negative TTL', () => {
      const options = builder.id('test-id').expireAfter(-1000).build();
      expect(options.ttl).toBe(-1000);
    });

    it('should handle complex releaseAfter condition', () => {
      const complexCondition = {
        condition: 'job.result.status === "completed" && job.result.data.size > 0',
        delay: 10000,
      };

      const options = builder.id('test-id').releaseAfter(complexCondition).build();

      expect(options.releaseAfter).toEqual(complexCondition);
    });
  });

  describe('Real-world Examples', () => {
    it('should create email deduplication options', () => {
      const options = builder
        .id(`welcome-email-${123}`)
        .expireAfter(86400000) // 24 hours
        .build();

      expect(options).toEqual({
        id: 'welcome-email-123',
        ttl: 86400000,
      });
    });

    it('should create file processing deduplication with manual release', () => {
      const options = builder
        .id('file-process-456')
        .expireAfter(3600000) // 1 hour
        .dontRelease()
        .build();

      expect(options).toEqual({
        id: 'file-process-456',
        ttl: 3600000,
        dontRelease: true,
      });
    });

    it('should create API throttling deduplication', () => {
      const options = builder
        .id(`api-call-${789}`)
        .expireAfter(60000) // 1 minute
        .build();

      expect(options).toEqual({
        id: 'api-call-789',
        ttl: 60000,
      });
    });

    it('should create debounced indexing deduplication', () => {
      const options = builder
        .id('index-doc-456')
        .expireAfter(10000) // 10 seconds
        .replace()
        .build();

      expect(options).toEqual({
        id: 'index-doc-456',
        ttl: 10000,
        replace: true,
      });
    });
  });
});
