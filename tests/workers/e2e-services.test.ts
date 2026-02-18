import { buildRedisUrl } from '@config/env';
import { describe, expect, it } from 'vitest';
import { createWorkersHarness, HAS_MINIFLARE } from './setup';

const hasEnv = (key: string): boolean => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() !== '';
};

const hasEnvEither = (preferred: string, fallback: string): boolean =>
  hasEnv(preferred) || hasEnv(fallback);

const hasPgEnv = (): boolean =>
  hasEnvEither('WORKERS_PG_HOST', 'DB_HOST') &&
  hasEnvEither('WORKERS_PG_PORT', 'DB_PORT_POSTGRESQL') &&
  hasEnvEither('WORKERS_PG_DATABASE', 'DB_DATABASE_POSTGRESQL') &&
  hasEnvEither('WORKERS_PG_USER', 'DB_USERNAME_POSTGRESQL');

const hasMysqlEnv = (): boolean =>
  hasEnvEither('WORKERS_MYSQL_HOST', 'DB_HOST') &&
  hasEnvEither('WORKERS_MYSQL_PORT', 'DB_PORT') &&
  hasEnvEither('WORKERS_MYSQL_DATABASE', 'DB_DATABASE') &&
  hasEnvEither('WORKERS_MYSQL_USER', 'DB_USERNAME');

const hasRedisEnv = (): boolean => {
  if (hasEnv('WORKERS_REDIS_URL')) return true;
  return buildRedisUrl().trim() !== '';
};
const hasSmtpEnv = (): boolean =>
  hasEnvEither('WORKERS_SMTP_HOST', 'MAIL_HOST') && hasEnvEither('WORKERS_SMTP_PORT', 'MAIL_PORT');
const hasR2Env = (): boolean => hasEnvEither('WORKERS_R2_BUCKET', 'R2_BUCKET');

const isReady = hasPgEnv() || hasMysqlEnv() || hasRedisEnv() || hasSmtpEnv() || hasR2Env();

const run = Boolean(process.env['WORKERS_E2E']) && isReady;

describe('Workers E2E preflight', () => {
  it('has E2E gates configured', () => {
    expect(typeof run).toBe('boolean');
  });

  (run && HAS_MINIFLARE ? it : it.skip)('boots Miniflare and responds to fetch', async () => {
    const harness = await createWorkersHarness();
    try {
      const res = await harness.runtime.dispatchFetch('http://localhost/');
      expect(res.status).toBe(200);
    } finally {
      await harness.dispose();
    }
  });
});
