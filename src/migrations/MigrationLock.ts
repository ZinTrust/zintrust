import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

function nowIso(): string {
  return new Date().toISOString();
}

export const MigrationLock = Object.freeze({
  acquire(lockFile: string): () => void {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });

    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, createdAt: nowIso() }, null, 2),
        'utf8'
      );
      fs.closeSync(fd);

      return () => {
        try {
          fs.unlinkSync(lockFile);
        } catch {
          // ignore
        }
      };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        if (code === 'EEXIST') {
          throw ErrorFactory.createCliError(
            `Migration lock already exists at ${lockFile}. Another migrate may be running.`
          );
        }
      }

      throw ErrorFactory.createTryCatchError('Failed to acquire migration lock', { cause: error });
    }
  },
});
