/**
 * Node.js HTTP Module Singleton
 * Safe to import in both API and CLI code
 * Exported from node:http built-in
 */

export { IncomingMessage, ServerResponse, createServer } from 'node:http';
export type { IncomingHttpHeaders, Server } from 'node:http';
