import { describe, expect, it } from 'vitest';
import { createWorkersHarness, HAS_MINIFLARE } from './setup';

const hasMysqlEnv = (): boolean => {
  return Boolean(
    process.env['WORKERS_MYSQL_HOST'] &&
    process.env['WORKERS_MYSQL_PORT'] &&
    process.env['WORKERS_MYSQL_DATABASE'] &&
    process.env['WORKERS_MYSQL_USER']
  );
};

describe('MySQL socket (Workers integration)', () => {
  if (hasMysqlEnv() && HAS_MINIFLARE) {
    it('connects via Miniflare when env configured', async () => {
      const harness = await createWorkersHarness();
      try {
        const response = await harness.runtime.dispatchFetch('http://localhost/');
        expect(response.status).toBe(200);
      } finally {
        await harness.dispose();
      }
    });
  } else {
    it('skips when WORKERS_MYSQL_* env not configured or miniflare missing', () => {
      expect(true).toBe(true);
    });
  }
});
