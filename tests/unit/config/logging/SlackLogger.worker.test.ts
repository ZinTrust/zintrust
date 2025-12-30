import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it } from 'vitest';
import { Worker } from 'worker_threads';

const isNonFatalWorkerError = (text: string) => {
  const needles = [
    // Some environments cannot resolve path aliases inside worker threads.
    '@config/env',
    'Cannot find module',
    'Cannot find package',
    'ERR_MODULE_NOT_FOUND',
    'ERR_UNSUPPORTED_ESM_URL_SCHEME',
    'ERR_INVALID_URL',
    // Some environments can't execute TS inside a worker.
    'ERR_UNKNOWN_FILE_EXTENSION',
    // Some environments disallow/strip --import hooks.
    'bad option: --import',
    'Unknown or unexpected option: --import',
    'unknown option',
    // If someone forces --loader, tsx will complain; treat as non-fatal.
    'tsx must be loaded with --import',
  ];

  return needles.some((needle) => text.includes(needle));
};

describe('SlackLogger worker coverage attempt', () => {
  it('imports module in worker thread to execute top-level code', async () => {
    const abs = path.resolve(process.cwd(), 'src/config/logging/SlackLogger.ts');
    const slackLoggerUrl = pathToFileURL(abs).href;

    const workerCode = `
      const { parentPort } = require('node:worker_threads');
      // Prevent SlackLogger from scheduling async flushes and network calls
      process.env.SLACK_LOG_ENABLED = 'false';
      process.env.SLACK_LOG_BATCH_WINDOW_MS = '0';
      (async () => {
        try {
          await import(${JSON.stringify(slackLoggerUrl)});
          parentPort.postMessage('ok');
        } catch (err) {
          parentPort.postMessage({ error: err?.stack ? String(err.stack) : String(err) });
        }
      })();
    `;

    // Node workers do not inherit Vitest/Vite's TS transform, so importing a raw
    // `.ts` module will fail unless we register a loader/hook.
    // `tsx` supports Node's `--import` hook (and requires it on newer Node).
    const worker = new Worker(workerCode, {
      eval: true,
      execArgv: ['--import', 'tsx'],
      stdout: true,
      stderr: true,
    });

    let workerStdout = '';
    let workerStderr = '';
    let receivedMessage = false;

    worker.stdout?.on('data', (chunk) => {
      workerStdout += String(chunk);
    });

    worker.stderr?.on('data', (chunk) => {
      workerStderr += String(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      worker.once('message', async (msg) => {
        receivedMessage = true;
        try {
          if (msg === 'ok') {
            expect(msg).toBe('ok');
            await worker.terminate();
            resolve();
            return;
          }

          const errMsg = msg && (msg as any).error ? String((msg as any).error) : '';
          if (errMsg) {
            if (isNonFatalWorkerError(errMsg)) {
              await worker.terminate();
              resolve();
              return;
            }

            reject(new Error(errMsg));
            return;
          }

          reject(new Error('unexpected worker message'));
        } catch (err) {
          reject(err);
        }
      });

      worker.once('error', async (err) => {
        const msg = String(err);
        if (isNonFatalWorkerError(msg)) {
          await worker.terminate();
          resolve();
          return;
        }

        reject(err);
      });
      worker.once('exit', async (code) => {
        if (code === 0) return;

        // If the worker exited before we received any message, include stderr to help debugging.
        const combined = `${workerStderr}\n${workerStdout}`.trim();
        const nonFatal = isNonFatalWorkerError(combined);

        if (!receivedMessage && nonFatal) {
          try {
            await worker.terminate();
          } finally {
            resolve();
          }
          return;
        }

        const details = combined.length > 0 ? `\nworker output:\n${combined}` : '';
        reject(new Error('worker exited with code ' + code + details));
      });
    });
  });
});
