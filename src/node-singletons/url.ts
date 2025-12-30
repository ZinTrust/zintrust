/**
 * Node.js URL Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:url built-in
 */

import * as url from 'node:url';

export const { fileURLToPath, pathToFileURL } = url;

export default url;
