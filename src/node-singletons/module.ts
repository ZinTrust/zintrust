/**
 * Node.js Module Singleton
 * Wrapper for node:module imports
 * CLI-only - should not be imported in API code
 */

import * as module from 'node:module';

export { createRequire } from 'node:module';

// Default export for compatibility
export default module;
