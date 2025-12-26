/**
 * Node.js Child Process Module Singleton
 * CLI-only: Should not be imported in API/serverless code
 * Exported from node:child_process built-in
 */

export { execFileSync, execSync, spawn } from 'node:child_process';
