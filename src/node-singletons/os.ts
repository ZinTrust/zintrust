/**
 * Node.js OS Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:os built-in
 */

export { arch, cpus, freemem, loadavg, platform, tmpdir, totalmem, type } from 'node:os';

// Also export the full module for compatibility
import * as osModule from 'node:os';
export default osModule;
