/**
 * Node.js Performance Hooks Module Singleton
 * Safe to import in both API and CLI code
 * Exported from node:perf_hooks built-in
 */

import * as perf_hooks from 'node:perf_hooks';

export const { performance } = perf_hooks;

export default perf_hooks;
