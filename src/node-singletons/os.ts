/**
 * Node.js OS Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:os built-in
 */

import * as os from 'node:os';

export const arch = os.arch;
export const cpus = os.cpus;
export const freemem = os.freemem;
export const hostname = os.hostname;
export const loadavg = os.loadavg;
export const platform = os.platform;
export const tmpdir = os.tmpdir;
export const totalmem = os.totalmem;
export const type = os.type;
export const uptime = os.uptime;

export default os;
