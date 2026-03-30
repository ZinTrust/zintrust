/**
 * Optional ZinTrust worker bootstrap.
 *
 * Docker worker containers and worker CLI commands auto-load this file when it exists.
 * For simple code-first workers that export `workerDefinition`, you usually do not need to
 * update this file after scaffolding. Keep it for advanced pre-registration or grouped imports.
 */

import '@app/Workers/ExampleWorker';

export const __zintrustGeneratedWorkerStub = 'zintrust.workers.ts';
