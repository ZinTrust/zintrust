import { describe, expect, it } from 'vitest';
import { createWorkersHarness } from './setup';

const hasPgEnv = (): boolean => {
  return Boolean(
    process.env['WORKERS_PG_HOST'] &&
    process.env['WORKERS_PG_PORT'] &&
    process.env['WORKERS_PG_DATABASE'] &&
    process.env['WORKERS_PG_USER']
  );
};

describe('PostgreSQL socket (Workers integration)', () => {
  if (hasPgEnv()) {
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
    it('skips when WORKERS_PG_* env not configured', () => {
      expect(true).toBe(true);
    });
  }
});
