import { spawn, type ChildProcess } from 'node:child_process';
import type { ITunnelProvider, TunnelOptions } from './ITunnelProvider.js';

const create = (): ITunnelProvider => {
  let childProcess: ChildProcess | null = null;
  let isStopping = false;
  let startupTimer: NodeJS.Timeout | undefined;

  const clearStartupTimer = (): void => {
    if (startupTimer !== undefined) {
      clearTimeout(startupTimer);
      startupTimer = undefined;
    }
  };

  const stop = async (): Promise<void> => {
    isStopping = true;
    clearStartupTimer();

    if (childProcess !== null) {
      childProcess.kill();
      childProcess = null;
    }
  };

  const start = async (options: TunnelOptions): Promise<string> => {
    return new Promise((resolve, reject) => {
      const scheme = options.https ? 'https' : 'http';
      const localUrl = `${scheme}://localhost:${options.port}`;
      const urlRegex = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/;
      let settled = false;

      const resolveOnce = (url: string): void => {
        if (settled) return;
        settled = true;
        clearStartupTimer();
        resolve(url);
      };

      const rejectOnce = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearStartupTimer();
        reject(error);
      };

      process.stdout.write(`Starting cloudflared tunnel to ${localUrl}...\n`);

      childProcess = spawn('npx', ['cloudflared', 'tunnel', '--url', localUrl], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      childProcess.stderr?.on('data', (data) => {
        const match = urlRegex.exec(data.toString());
        if (match !== null) {
          resolveOnce(match[1]);
        }
      });

      childProcess.on('close', (code) => {
        clearStartupTimer();
        if (!isStopping && code !== 0 && !settled) {
          rejectOnce(new Error(`Tunnel closed unexpectedly with code ${String(code)}`));
        }
      });

      childProcess.on('error', (error) => {
        rejectOnce(error);
      });

      // eslint-disable-next-line no-restricted-syntax
      startupTimer = setTimeout(() => {
        void stop().finally(() => {
          rejectOnce(new Error('Cloudflared tunnel startup timed out.'));
        });
      }, 15000);
    });
  };

  return Object.freeze({
    start,
    stop,
  });
};

export const CloudflareProvider = Object.freeze({
  create,
});
