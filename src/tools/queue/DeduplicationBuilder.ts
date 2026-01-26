/**
 * Deduplication Builder - Plain function implementation for BullMQ job deduplication
 * Follows ZinTrust's preference for functions over classes
 */

import type { DeduplicationOptions, ReleaseCondition } from '@/types/Queue';
import { createValidationError } from '@exceptions/ZintrustError';

export type ReleaseStrategy = string | number | ReleaseCondition;

export interface DeduplicationBuilder {
  id(id: string): DeduplicationBuilder;
  expireAfter(ms: number): DeduplicationBuilder;
  dontRelease(): DeduplicationBuilder;
  replace(): DeduplicationBuilder;
  releaseAfter(strategy: ReleaseStrategy): DeduplicationBuilder;
  build(): DeduplicationOptions;
}

interface DeduplicationBuilderState {
  id?: string;
  ttl?: number;
  dontRelease?: boolean;
  replace?: boolean;
  releaseAfter?: ReleaseStrategy;
}

/**
 * Creates a deduplication builder for configuring job deduplication options
 * @returns {DeduplicationBuilder} Builder instance with fluent interface
 */
export function createDeduplicationBuilder(): DeduplicationBuilder {
  const state: DeduplicationBuilderState = {};

  return {
    /**
     * Set the unique identifier for deduplication
     * @param id - Unique identifier string
     */
    id(id: string): DeduplicationBuilder {
      state.id = id;
      return this;
    },

    /**
     * Set time-to-live for deduplication lock in milliseconds
     * @param ms - TTL in milliseconds
     */
    expireAfter(ms: number): DeduplicationBuilder {
      state.ttl = ms;
      return this;
    },

    /**
     * Prevent automatic lock release - requires manual release
     */
    dontRelease(): DeduplicationBuilder {
      state.dontRelease = true;
      return this;
    },

    /**
     * Replace existing job with same ID instead of ignoring
     */
    replace(): DeduplicationBuilder {
      state.replace = true;
      return this;
    },

    /**
     * Set release strategy for the deduplication lock
     * @param strategy - Release strategy (delay, 'success', or condition object)
     */
    releaseAfter(strategy: string | number | ReleaseCondition): DeduplicationBuilder {
      state.releaseAfter = strategy;
      return this;
    },

    /**
     * Build the final deduplication options
     * @returns {DeduplicationOptions} Configured deduplication options
     */
    build(): DeduplicationOptions {
      if (state.id === null || state.id === undefined || state.id === '') {
        throw createValidationError('Deduplication ID is required. Call .id() before .build()');
      }

      const options: DeduplicationOptions = {
        id: state.id,
      };

      if (state.ttl !== undefined) {
        options.ttl = state.ttl;
      }

      if (state.dontRelease === true) {
        options.dontRelease = true;
      }

      if (state.replace === true) {
        options.replace = true;
      }

      if (state.releaseAfter !== undefined) {
        options.releaseAfter = state.releaseAfter;
      }

      return options;
    },
  } as DeduplicationBuilder;
}
