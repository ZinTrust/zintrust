/**
 * Node.js OS Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:os built-in
 */

import * as os from 'node:os';

export const { arch, cpus, freemem, loadavg, platform, tmpdir, totalmem, type } = os;

export default os;
