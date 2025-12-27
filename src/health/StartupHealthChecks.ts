/**
 * Startup Health Checks
 *
 * Lightweight boot-time checks that validate the runtime environment before
 * the server starts accepting requests.
 */

import { Cache } from '@cache/Cache';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { startupConfig } from '@config/startup';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Database } from '@orm/Database';
import type { DatabaseConfig } from '@orm/DatabaseAdapter';
import { StartupSecretValidation } from '@security/StartupSecretValidation';

export type StartupHealthCheck = {
  name: string;
  ok: boolean;
  durationMs?: number;
  details?: unknown;
};

export type StartupHealthReport = {
  ok: boolean;
  checks: StartupHealthCheck[];
};

export const StartupHealthChecks = Object.freeze({
  async run(): Promise<StartupHealthReport> {
    if (!startupConfig.healthChecksEnabled) {
      return { ok: true, checks: [{ name: 'startup.healthChecks', ok: true }] };
    }

    const checks: StartupHealthCheck[] = [];

    const secrets = StartupSecretValidation.validate();
    checks.push({
      name: 'startup.secrets',
      ok: secrets.valid,
      details: secrets.valid ? undefined : { errors: secrets.errors },
    });

    if (startupConfig.checkDatabase === true) {
      // Minimal config derived from Env. For Workers D1, the adapter will resolve the binding via Cloudflare helpers.
      const driver = (Env.DB_CONNECTION || 'sqlite') as DatabaseConfig['driver'];
      const readHosts =
        Env.DB_READ_HOSTS.trim().length > 0 ? Env.DB_READ_HOSTS.split(',') : undefined;

      const config: DatabaseConfig = {
        driver,
        database: Env.DB_DATABASE,
        host: Env.DB_HOST,
        port: Env.DB_PORT,
        username: Env.DB_USERNAME,
        password: Env.DB_PASSWORD,
        readHosts,
      };

      checks.push(await StartupHealthChecks.checkDatabase(config));
    }

    if (startupConfig.checkCache === true) {
      checks.push(await StartupHealthChecks.checkCache());
    }

    return { ok: checks.every((c) => c.ok), checks };
  },

  async assertHealthy(): Promise<StartupHealthReport> {
    const report = await StartupHealthChecks.run();
    if (report.ok) return report;

    if (startupConfig.continueOnFailure === true) {
      Logger.warn('Startup health checks failed but continuing due to configuration', { report });
      return report;
    }

    throw ErrorFactory.createConfigError('Startup health checks failed', { report });
  },

  async checkDatabase(config: DatabaseConfig): Promise<StartupHealthCheck> {
    const startedAt = Date.now();

    try {
      await StartupHealthChecks.withTimeout('startup.database.connect', async () => {
        const db = Database.create(config);
        await db.connect();
        try {
          await db.queryOne('SELECT 1 as ok', []);
        } finally {
          await db.disconnect();
        }
      });

      return { name: 'startup.database', ok: true, durationMs: Date.now() - startedAt };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: 'startup.database',
        ok: false,
        durationMs: Date.now() - startedAt,
        details: { message },
      };
    }
  },

  async checkCache(): Promise<StartupHealthCheck> {
    const startedAt = Date.now();
    const key = `__startup_health__:${crypto.randomUUID()}`;

    try {
      await StartupHealthChecks.withTimeout('startup.cache.probe', async () => {
        await Cache.set(key, { ok: true }, 60);
        const value = await Cache.get<{ ok: boolean }>(key);
        await Cache.delete(key);

        if (value?.ok !== true) {
          throw ErrorFactory.createConfigError('Cache probe failed', { key });
        }
      });

      return { name: 'startup.cache', ok: true, durationMs: Date.now() - startedAt };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: 'startup.cache',
        ok: false,
        durationMs: Date.now() - startedAt,
        details: { message },
      };
    }
  },

  async withTimeout(name: string, fn: () => Promise<void>): Promise<void> {
    const timeoutMs = Math.max(1, Number(startupConfig.timeoutMs));

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        reject(ErrorFactory.createConfigError(`Startup check timed out: ${name}`, { timeoutMs }));
      }, timeoutMs);
    });

    try {
      await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    }
  },
});

export default StartupHealthChecks;
