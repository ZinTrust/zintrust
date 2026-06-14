/* eslint-disable no-await-in-loop, complexity, max-lines-per-function */
/* eslint-disable no-negated-condition, no-nested-ternary, no-restricted-syntax */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* sonarqube-disable cognitive-complexity, no-nested-conditional, no-nested-ternary */
/* sonarqube-disable no-negated-condition, S3776 */
/* Sequential processing required, complex functions by design */
import { ErrorFactory } from '@zintrust/core/errors';
import { generateUuid } from '@zintrust/core/utils';
import type {
  CloudflareFlowInput,
  CloudflareFlowResult,
  CloudflareJobOptions,
  CloudflareQueueJob,
  CloudflareQueueJobRow,
  CloudflareQueueKvBinding,
  CloudflareQueueMetrics,
  CloudflareQueueState,
  CloudflareQueueStateConfig,
  CloudflareRepeatableRow,
  D1DatabaseLike,
  ZinTrustDatabaseLike,
} from './types.js';

type StoreTarget =
  | { kind: 'd1'; db: D1DatabaseLike }
  | { kind: 'zintrust'; db: ZinTrustDatabaseLike };

type CreateJobInput<T = unknown> = {
  queueName: string;
  name: string;
  data: T;
  options?: CloudflareJobOptions;
};

type UpdateStateInput = {
  queueName: string;
  jobId: string;
  state: CloudflareQueueState;
  error?: unknown;
  result?: unknown;
  incrementAttempts?: boolean;
  availableAt?: string;
};

type RepeatableInput<T = unknown> = {
  id?: string;
  queueName: string;
  name: string;
  data: T;
  options: NonNullable<CloudflareJobOptions['repeat']>;
};

type QueryRowsResult<T> = Promise<T[]>;

const nowIso = (): string => new Date().toISOString();

const serialize = (value: unknown): string => JSON.stringify(value ?? null);

const deserialize = (value: string | null): unknown => {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const rowNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return 100;
  return Math.min(Math.floor(limit), 1000);
};

const resolveTarget = (config?: CloudflareQueueStateConfig): StoreTarget => {
  if (config?.d1 !== undefined) return { kind: 'd1', db: config.d1 };
  if (config?.db !== undefined) return { kind: 'zintrust', db: config.db };

  const env = (globalThis as unknown as { env?: Record<string, unknown> }).env;
  const bindingName = config?.d1BindingName ?? 'QUEUE_DB';
  const d1 = env?.[bindingName] as D1DatabaseLike | undefined;
  if (d1 !== undefined && typeof d1.prepare === 'function') return { kind: 'd1', db: d1 };

  throw ErrorFactory.createConfigError(
    `Cloudflare queue state store requires a D1 binding (${bindingName}) or ZinTrust database`
  );
};

const resolveKv = (config?: CloudflareQueueStateConfig): CloudflareQueueKvBinding | null => {
  if (config?.kv !== undefined) return config.kv;
  const env = (globalThis as unknown as { env?: Record<string, unknown> }).env;
  const bindingName = config?.kvBindingName ?? 'QUEUE_KV';
  const kv = env?.[bindingName] as CloudflareQueueKvBinding | undefined;
  return kv !== undefined && typeof kv.get === 'function' ? kv : null;
};

const queryRows = async <T>(
  target: StoreTarget,
  sql: string,
  params: unknown[] = []
): QueryRowsResult<T> => {
  if (target.kind === 'd1') {
    const result = await target.db
      .prepare(sql)
      .bind(...params)
      .all<T>();
    return result.results ?? [];
  }

  return (await target.db.query(sql, params)) as T[];
};

const queryOne = async <T>(
  target: StoreTarget,
  sql: string,
  params: unknown[] = []
): Promise<T | null> => {
  if (target.kind === 'd1') {
    return await target.db
      .prepare(sql)
      .bind(...params)
      .first<T>();
  }

  return ((await target.db.queryOne(sql, params)) as T | null) ?? null;
};

const execute = async (target: StoreTarget, sql: string, params: unknown[] = []): Promise<void> => {
  if (target.kind === 'd1') {
    await target.db
      .prepare(sql)
      .bind(...params)
      .run();
    return;
  }

  await target.db.execute(sql, params);
};

const toJob = <T>(
  row: CloudflareQueueJobRow,
  store: ReturnType<typeof createCloudflareJobStore>
): CloudflareQueueJob<T> => {
  return {
    id: row.id,
    queueName: row.queue_name,
    name: row.name,
    data: deserialize(row.payload) as T,
    state: row.state,
    attemptsMade: row.attempts,
    maxAttempts: row.max_attempts,
    priority: row.priority,
    progress: deserialize(row.progress),
    result: deserialize(row.result),
    error: deserialize(row.error),
    opts: deserialize(row.opts) ?? {},
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updateProgress: async (progress: unknown): Promise<void> => {
      await store.updateProgress(row.queue_name, row.id, progress);
    },
    log: async (message: string, data?: unknown): Promise<void> => {
      await store.recordLog(row.queue_name, row.id, 'info', message, data);
    },
    remove: async (): Promise<void> => {
      await store.updateState({
        queueName: row.queue_name,
        jobId: row.id,
        state: 'canceled',
      });
    },
    retry: async (): Promise<void> => {
      await store.updateState({
        queueName: row.queue_name,
        jobId: row.id,
        state: 'waiting',
      });
    },
  };
};

function createCloudflareJobStore(config?: CloudflareQueueStateConfig) {
  const target = resolveTarget(config);
  const kv = resolveKv(config);

  const recordEvent = async (
    queueName: string,
    jobId: string,
    event: string,
    data?: unknown
  ): Promise<void> => {
    await execute(
      target,
      'INSERT INTO cf_queue_job_events (id, job_id, queue_name, event, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [generateUuid(), jobId, queueName, event, serialize(data), nowIso()]
    );
  };

  const store = {
    async createJob<T = unknown>(input: CreateJobInput<T>): Promise<CloudflareQueueJob<T>> {
      const options = input.options ?? {};
      const jobId = options.jobId ?? generateUuid();
      const dedupeKey = options.deduplication?.id ?? null;
      const idempotencyKey = options.uniqueId ?? null;
      const dedupeCacheKey =
        dedupeKey === null ? null : `cfq:dedupe:${input.queueName}:${dedupeKey}`;
      const idempotencyCacheKey =
        idempotencyKey === null ? null : `cfq:idempotency:${input.queueName}:${idempotencyKey}`;

      if (options.deduplication?.collisionBehavior !== 'enqueue') {
        const cachedId =
          (dedupeCacheKey !== null ? await kv?.get(dedupeCacheKey) : null) ??
          (idempotencyCacheKey !== null ? await kv?.get(idempotencyCacheKey) : null) ??
          null;
        if (cachedId !== null && cachedId.trim() !== '') {
          const cached = await store.getJob<T>(input.queueName, cachedId);
          if (cached !== null) return cached;
        }

        const existing = await queryOne<CloudflareQueueJobRow>(
          target,
          `SELECT * FROM cf_queue_jobs
            WHERE queue_name = ?
              AND (
                id = ?
                OR (? IS NOT NULL AND dedupe_key = ?)
                OR (? IS NOT NULL AND idempotency_key = ?)
              )
            LIMIT 1`,
          [input.queueName, jobId, dedupeKey, dedupeKey, idempotencyKey, idempotencyKey]
        );
        if (existing !== null) return toJob<T>(existing, store);
      }

      const delayMs = Math.max(0, options.delay ?? 0);
      const availableAt = new Date(Date.now() + delayMs).toISOString();
      const state: CloudflareQueueState =
        delayMs > 0 ? 'delayed' : options.priority !== undefined ? 'prioritized' : 'waiting';
      const timestamp = nowIso();
      const maxAttempts = Math.max(1, Math.floor(options.attempts ?? 1));

      await execute(
        target,
        `INSERT INTO cf_queue_jobs (
          id, queue_name, name, payload, opts, state, priority, attempts, max_attempts,
          progress, result, error, dedupe_key, idempotency_key, available_at,
          started_at, completed_at, failed_at, stalled_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          input.queueName,
          input.name,
          serialize(input.data),
          serialize(options),
          state,
          Math.max(0, Math.floor(options.priority ?? 0)),
          0,
          maxAttempts,
          null,
          null,
          null,
          options.deduplication?.id ?? null,
          options.uniqueId ?? null,
          availableAt,
          null,
          null,
          null,
          null,
          timestamp,
          timestamp,
        ]
      );

      if (dedupeCacheKey !== null) {
        await kv?.put(dedupeCacheKey, jobId, {
          expirationTtl: options.deduplication?.ttl,
        });
      }
      if (idempotencyCacheKey !== null) {
        await kv?.put(idempotencyCacheKey, jobId, {
          expirationTtl: options.deduplication?.ttl,
        });
      }

      await recordEvent(input.queueName, jobId, 'created', { state, options });
      const job = await store.getJob<T>(input.queueName, jobId);
      if (job === null) throw new Error(`Created Cloudflare queue job not found: ${jobId}`);
      return job;
    },

    async getJob<T = unknown>(
      queueName: string,
      jobId: string
    ): Promise<CloudflareQueueJob<T> | null> {
      const row = await queryOne<CloudflareQueueJobRow>(
        target,
        'SELECT * FROM cf_queue_jobs WHERE queue_name = ? AND id = ? LIMIT 1',
        [queueName, jobId]
      );
      return row === null ? null : toJob<T>(row, store);
    },

    async getJobs<T = unknown>(
      queueName: string,
      states?: CloudflareQueueState[],
      limit?: number
    ): Promise<Array<CloudflareQueueJob<T>>> {
      const requestedStates = states?.filter((state) => state.trim() !== '') ?? [];
      const normalizedLimit = normalizeLimit(limit);
      const params: unknown[] = [queueName];
      let sql = 'SELECT * FROM cf_queue_jobs WHERE queue_name = ?';

      if (requestedStates.length > 0) {
        sql += ` AND state IN (${requestedStates.map(() => '?').join(', ')})`;
        params.push(...requestedStates);
      }

      sql += ' ORDER BY priority ASC, available_at ASC, created_at ASC LIMIT ?';
      params.push(normalizedLimit);

      const rows = await queryRows<CloudflareQueueJobRow>(target, sql, params);
      return rows.map((row) => toJob<T>(row, store));
    },

    async getJobCounts(
      queueName: string,
      ...states: CloudflareQueueState[]
    ): Promise<Record<string, number>> {
      const requestedStates = states.length > 0 ? states : undefined;
      const jobs = await queryRows<{ state: string; count: number }>(
        target,
        `SELECT state, COUNT(*) AS count FROM cf_queue_jobs WHERE queue_name = ?${
          requestedStates !== undefined
            ? ` AND state IN (${requestedStates.map(() => '?').join(', ')})`
            : ''
        } GROUP BY state`,
        requestedStates !== undefined ? [queueName, ...requestedStates] : [queueName]
      );

      return Object.fromEntries(jobs.map((row) => [row.state, rowNumber(row.count)]));
    },

    async getMetrics(queueName: string): Promise<CloudflareQueueMetrics> {
      const counts = await store.getJobCounts(queueName);
      return {
        queueName,
        counts,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      };
    },

    async updateState(input: UpdateStateInput): Promise<void> {
      const timestamp = nowIso();
      const sets = ['state = ?', 'updated_at = ?'];
      const params: unknown[] = [input.state, timestamp];

      if (input.incrementAttempts === true) sets.push('attempts = attempts + 1');
      if (input.availableAt !== undefined) {
        sets.push('available_at = ?');
        params.push(input.availableAt);
      }
      if (input.state === 'active') {
        sets.push('started_at = ?');
        params.push(timestamp);
      }
      if (input.state === 'completed') {
        sets.push('completed_at = ?', 'result = ?');
        params.push(timestamp, serialize(input.result));
      }
      if (input.state === 'failed' || input.state === 'dead_lettered') {
        sets.push('failed_at = ?', 'error = ?');
        params.push(timestamp, serialize(input.error));
      }
      if (input.state === 'stalled') {
        sets.push('stalled_at = ?');
        params.push(timestamp);
      }

      params.push(input.queueName, input.jobId);
      await execute(
        target,
        `UPDATE cf_queue_jobs SET ${sets.join(', ')} WHERE queue_name = ? AND id = ?`,
        params
      );
      await recordEvent(input.queueName, input.jobId, input.state, {
        error: input.error,
        result: input.result,
      });
    },

    async updateProgress(queueName: string, jobId: string, progress: unknown): Promise<void> {
      await execute(
        target,
        'UPDATE cf_queue_jobs SET progress = ?, updated_at = ? WHERE queue_name = ? AND id = ?',
        [serialize(progress), nowIso(), queueName, jobId]
      );
      await recordEvent(queueName, jobId, 'progress', progress);
    },

    async recordLog(
      queueName: string,
      jobId: string,
      level: string,
      message: string,
      data?: unknown
    ): Promise<void> {
      await execute(
        target,
        'INSERT INTO cf_queue_job_logs (id, job_id, queue_name, level, message, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [generateUuid(), jobId, queueName, level, message, serialize(data), nowIso()]
      );
    },

    async getDueJobs<T = unknown>(
      queueName: string,
      limit?: number
    ): Promise<Array<CloudflareQueueJob<T>>> {
      const rows = await queryRows<CloudflareQueueJobRow>(
        target,
        `SELECT * FROM cf_queue_jobs
          WHERE queue_name = ?
            AND state IN ('waiting', 'delayed', 'prioritized', 'retrying')
            AND available_at <= ?
          ORDER BY priority ASC, available_at ASC, created_at ASC
          LIMIT ?`,
        [queueName, nowIso(), normalizeLimit(limit)]
      );
      return rows.map((row) => toJob<T>(row, store));
    },

    async clean(
      queueName: string,
      states: CloudflareQueueState[],
      olderThanMs: number
    ): Promise<void> {
      if (states.length === 0) return;
      const cutoff = new Date(Date.now() - Math.max(0, olderThanMs)).toISOString();
      await execute(
        target,
        `DELETE FROM cf_queue_jobs WHERE queue_name = ? AND state IN (${states
          .map(() => '?')
          .join(', ')}) AND updated_at < ?`,
        [queueName, ...states, cutoff]
      );
    },

    async markDispatched(queueName: string, jobId: string): Promise<void> {
      await store.updateState({ queueName, jobId, state: 'queued' });
    },

    async getStalledJobs<T = unknown>(
      queueName: string,
      olderThanMs: number,
      limit?: number
    ): Promise<Array<CloudflareQueueJob<T>>> {
      const cutoff = new Date(Date.now() - Math.max(1000, olderThanMs)).toISOString();
      const rows = await queryRows<CloudflareQueueJobRow>(
        target,
        `SELECT * FROM cf_queue_jobs
          WHERE queue_name = ? AND state = 'active' AND updated_at < ?
          ORDER BY updated_at ASC
          LIMIT ?`,
        [queueName, cutoff, normalizeLimit(limit)]
      );
      return rows.map((row) => toJob<T>(row, store));
    },

    async applyRetention(
      queueName: string,
      jobId: string,
      state: 'completed' | 'failed'
    ): Promise<void> {
      const job = await store.getJob(queueName, jobId);
      if (job === null) return;
      const setting = state === 'completed' ? job.opts.removeOnComplete : job.opts.removeOnFail;
      if (setting === false || setting === undefined) return;
      if (setting === true) {
        await execute(target, 'DELETE FROM cf_queue_jobs WHERE queue_name = ? AND id = ?', [
          queueName,
          jobId,
        ]);
        return;
      }

      if (typeof setting === 'number') {
        await store.clean(queueName, [state], setting * 1000);
        return;
      }

      if (typeof setting === 'object') {
        if (typeof setting.age === 'number') {
          await store.clean(queueName, [state], setting.age * 1000);
        }
        if (typeof setting.count === 'number' && setting.count >= 0) {
          const rows = await queryRows<{ id: string }>(
            target,
            `SELECT id FROM cf_queue_jobs
              WHERE queue_name = ? AND state = ?
              ORDER BY updated_at DESC
              LIMIT -1 OFFSET ?`,
            [queueName, state, Math.floor(setting.count)]
          );
          for (const row of rows) {
            await execute(target, 'DELETE FROM cf_queue_jobs WHERE queue_name = ? AND id = ?', [
              queueName,
              row.id,
            ]);
          }
        }
      }
    },

    async upsertRepeatable<T = unknown>(
      input: RepeatableInput<T>
    ): Promise<CloudflareRepeatableRow> {
      const id = input.id ?? generateUuid();
      const timestamp = nowIso();
      const startAt = input.options.startDate?.toISOString() ?? null;
      const nextRunAt =
        startAt ?? new Date(Date.now() + (input.options.every ?? 60_000)).toISOString();

      await execute(
        target,
        `INSERT OR REPLACE INTO cf_queue_repeatables (
          id, queue_name, name, payload, cron, every_ms, start_at, end_at,
          limit_count, run_count, next_run_at, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT run_count FROM cf_queue_repeatables WHERE id = ?), 0), ?, 1, ?, ?)`,
        [
          id,
          input.queueName,
          input.name,
          serialize(input.data),
          input.options.cron ?? null,
          input.options.every ?? null,
          startAt,
          input.options.endDate?.toISOString() ?? null,
          input.options.limit ?? null,
          id,
          nextRunAt,
          timestamp,
          timestamp,
        ]
      );

      const row = await queryOne<CloudflareRepeatableRow>(
        target,
        'SELECT * FROM cf_queue_repeatables WHERE id = ? LIMIT 1',
        [id]
      );
      if (row === null) throw new Error(`Repeatable job not found after upsert: ${id}`);
      return row;
    },

    async getDueRepeatables(limit?: number): Promise<CloudflareRepeatableRow[]> {
      return await queryRows<CloudflareRepeatableRow>(
        target,
        `SELECT * FROM cf_queue_repeatables
          WHERE active = 1 AND next_run_at <= ?
          ORDER BY next_run_at ASC
          LIMIT ?`,
        [nowIso(), normalizeLimit(limit)]
      );
    },

    async updateRepeatableAfterRun(row: CloudflareRepeatableRow): Promise<void> {
      const everyMs = row.every_ms ?? 60_000;
      const runCount = row.run_count + 1;
      const shouldDeactivate =
        (row.limit_count !== null && runCount >= row.limit_count) ||
        (row.end_at !== null && new Date(row.end_at).getTime() <= Date.now());
      const nextRunAt = new Date(Date.now() + everyMs).toISOString();

      await execute(
        target,
        'UPDATE cf_queue_repeatables SET run_count = ?, next_run_at = ?, active = ?, updated_at = ? WHERE id = ?',
        [runCount, nextRunAt, shouldDeactivate ? 0 : 1, nowIso(), row.id]
      );
    },

    async removeRepeatable(id: string): Promise<void> {
      await execute(
        target,
        'UPDATE cf_queue_repeatables SET active = 0, updated_at = ? WHERE id = ?',
        [nowIso(), id]
      );
    },

    async createFlow<TParent = unknown, TChild = unknown>(
      input: CloudflareFlowInput<TParent, TChild>
    ): Promise<CloudflareFlowResult<TParent, TChild>> {
      const parent = await store.createJob({
        queueName: input.queueName,
        name: input.parent.name,
        data: input.parent.data,
        options: input.parent.options,
      });

      await store.updateState({
        queueName: input.queueName,
        jobId: parent.id,
        state: 'waiting_children',
      });

      const children: Array<CloudflareQueueJob<TChild>> = [];
      for (const childInput of input.children) {
        const child = await store.createJob<TChild>({
          queueName: input.queueName,
          name: childInput.name,
          data: childInput.data,
          options: childInput.options,
        });
        children.push(child);
        await execute(
          target,
          'INSERT INTO cf_queue_flow_dependencies (id, queue_name, parent_job_id, child_job_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [generateUuid(), input.queueName, parent.id, child.id, 'waiting', nowIso(), nowIso()]
        );
      }

      const updatedParent = await store.getJob<TParent>(input.queueName, parent.id);
      if (updatedParent === null)
        throw new Error(`Flow parent not found after creation: ${parent.id}`);

      return { parent: updatedParent, children };
    },

    async markFlowChildCompleted(
      queueName: string,
      childJobId: string
    ): Promise<Array<CloudflareQueueJob>> {
      await execute(
        target,
        'UPDATE cf_queue_flow_dependencies SET state = ?, updated_at = ? WHERE queue_name = ? AND child_job_id = ?',
        ['completed', nowIso(), queueName, childJobId]
      );

      const rows = await queryRows<{ parent_job_id: string }>(
        target,
        'SELECT DISTINCT parent_job_id FROM cf_queue_flow_dependencies WHERE queue_name = ? AND child_job_id = ?',
        [queueName, childJobId]
      );

      const released: CloudflareQueueJob[] = [];
      for (const row of rows) {
        const pending = await queryOne<{ count: number }>(
          target,
          'SELECT COUNT(*) AS count FROM cf_queue_flow_dependencies WHERE queue_name = ? AND parent_job_id = ? AND state != ?',
          [queueName, row.parent_job_id, 'completed']
        );

        if (rowNumber(pending?.count) === 0) {
          await store.updateState({
            queueName,
            jobId: row.parent_job_id,
            state: 'waiting',
          });
          const parent = await store.getJob(queueName, row.parent_job_id);
          if (parent !== null) released.push(parent);
        }
      }
      return released;
    },

    async getFlowChildren<T = unknown>(
      queueName: string,
      parentJobId: string
    ): Promise<Array<CloudflareQueueJob<T>>> {
      const rows = await queryRows<CloudflareQueueJobRow>(
        target,
        `SELECT jobs.*
          FROM cf_queue_jobs jobs
          INNER JOIN cf_queue_flow_dependencies deps
            ON deps.child_job_id = jobs.id AND deps.queue_name = jobs.queue_name
          WHERE deps.queue_name = ? AND deps.parent_job_id = ?
          ORDER BY jobs.created_at ASC`,
        [queueName, parentJobId]
      );
      return rows.map((row) => toJob<T>(row, store));
    },
  };

  return store;
}

export type CloudflareJobStore = ReturnType<typeof createCloudflareJobStore>;

export const CloudflareJobStore = Object.freeze({
  create: createCloudflareJobStore,
});
