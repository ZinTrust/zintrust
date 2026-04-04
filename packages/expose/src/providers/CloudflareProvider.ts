import { spawn, type ChildProcess } from 'node:child_process';
import type { ITunnelProvider, TunnelOptions } from './ITunnelProvider.js';

type ResolveOnce = (url: string) => void;
type RejectOnce = (error: Error) => void;

const createTunnelUrlHandler = (urlRegex: RegExp, resolveOnce: ResolveOnce) => {
  return (data: string | Uint8Array): void => {
    const match = urlRegex.exec(data.toString());
    if (match !== null) {
      resolveOnce(match[1]);
    }
  };
};

const createTunnelCloseHandler = (
  clearStartupTimer: () => void,
  shouldReject: () => boolean,
  rejectOnce: RejectOnce
) => {
  return (code: number | null): void => {
    clearStartupTimer();
    if (shouldReject() && code !== 0) {
      rejectOnce(new Error(`Tunnel closed unexpectedly with code ${String(code)}`));
    }
  };
};

const createTunnelErrorHandler = (rejectOnce: RejectOnce) => {
  return (error: Error): void => {
    rejectOnce(error);
  };
};

const rejectStartupTimeout = (rejectOnce: RejectOnce): void => {
  rejectOnce(new Error('Cloudflared tunnel startup timed out.'));
};

const stopAfterStartupTimeout = async (
  stop: () => Promise<void>,
  rejectOnce: RejectOnce
): Promise<void> => {
  try {
    await stop();
  } finally {
    rejectStartupTimeout(rejectOnce);
  }
};

const createStartupTimeoutHandler = (stop: () => Promise<void>, rejectOnce: RejectOnce) => {
  return (): void => {
    void stopAfterStartupTimeout(stop, rejectOnce);
  };
};

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

      const handleTunnelUrl = createTunnelUrlHandler(urlRegex, resolveOnce);
      const handleClose = createTunnelCloseHandler(
        clearStartupTimer,
        () => !isStopping && !settled,
        rejectOnce
      );
      const handleError = createTunnelErrorHandler(rejectOnce);
      const handleStartupTimeout = createStartupTimeoutHandler(stop, rejectOnce);

      childProcess.stderr?.on('data', handleTunnelUrl);

      childProcess.on('close', handleClose);

      childProcess.on('error', handleError);

      startupTimer = globalThis.setTimeout(handleStartupTimeout, 15000);
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
