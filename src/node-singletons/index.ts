/**
 * Node.js Singleton Modules
 * Centralized exports for all node:* imports
 * This allows conditional loading and runtime-aware imports
 *
 * Safe for all runtimes (API, CLI, Serverless):
 * - http
 * - crypto
 * - events
 * - perf-hooks
 *
 * CLI-only (Node.js):
 * - fs
 * - path
 * - child-process
 * - url
 * - os
 * - readline
 */

// Safe for all runtimes
export * from '@node-singletons/crypto';
export * from '@node-singletons/events';
export * from '@node-singletons/http';
export * from '@node-singletons/perf-hooks';

// CLI-only (should not be imported in API code)
export * as childProcess from '@node-singletons/child-process';
export * as fs from '@node-singletons/fs';
export * as os from '@node-singletons/os';
export * as path from '@node-singletons/path';
export * as readline from '@node-singletons/readline';
export * as url from '@node-singletons/url';
