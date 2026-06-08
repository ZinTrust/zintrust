import { describe, expect, it } from 'vitest';

type Statement = {
  sql: string;
  params: unknown[];
};

class FakeD1 {
  statements: Statement[] = [];
  jobs = new Map<string, Record<string, unknown>>();
  events: Record<string, unknown>[] = [];
  logs: Record<string, unknown>[] = [];
  repeatables = new Map<string, Record<string, unknown>>();
  dependencies: Record<string, unknown>[] = [];

  prepare(sql: string) {
    const db = this;
    return {
      params: [] as unknown[],
      bind(...values: unknown[]) {
        this.params = values;
        return this;
      },
      async run() {
        db.run(sql, this.params);
        return {};
      },
      async first<T>() {
        return (db.query(sql, this.params)[0] ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.query(sql, this.params) as T[] };
      },
    };
  }

  run(sql: string, params: unknown[]): void {
    this.statements.push({ sql, params });
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('INSERT INTO cf_queue_jobs')) {
      this.jobs.set(String(params[0]), {
        id: params[0],
        queue_name: params[1],
        name: params[2],
        payload: params[3],
        opts: params[4],
        state: params[5],
        priority: params[6],
        attempts: params[7],
        max_attempts: params[8],
        progress: params[9],
        result: params[10],
        error: params[11],
        dedupe_key: params[12],
        idempotency_key: params[13],
        available_at: params[14],
        started_at: params[15],
        completed_at: params[16],
        failed_at: params[17],
        stalled_at: params[18],
        created_at: params[19],
        updated_at: params[20],
      });
      return;
    }

    if (normalized.startsWith('INSERT INTO cf_queue_job_events')) {
      this.events.push({ id: params[0], job_id: params[1], queue_name: params[2], event: params[3] });
      return;
    }

    if (normalized.startsWith('INSERT INTO cf_queue_job_logs')) {
      this.logs.push({ id: params[0], job_id: params[1], queue_name: params[2], message: params[4] });
      return;
    }

    if (normalized.startsWith('UPDATE cf_queue_jobs SET state =')) {
      const queueName = String(params.at(-2));
      const jobId = String(params.at(-1));
      const job = this.jobs.get(jobId);
      if (job !== undefined && job['queue_name'] === queueName) {
        job['state'] = params[0];
        job['updated_at'] = params[1];
        if (normalized.includes('attempts = attempts + 1')) {
          job['attempts'] = Number(job['attempts'] ?? 0) + 1;
        }
        if (normalized.includes('available_at = ?')) {
          job['available_at'] = params[2];
        }
        if (normalized.includes('result = ?')) {
          job['result'] = params[3];
        }
        if (normalized.includes('error = ?')) {
          job['error'] = params[3];
        }
      }
      return;
    }

    if (normalized.startsWith('UPDATE cf_queue_jobs SET progress =')) {
      const job = this.jobs.get(String(params[3]));
      if (job !== undefined) job['progress'] = params[0];
      return;
    }

    if (normalized.startsWith('INSERT OR REPLACE INTO cf_queue_repeatables')) {
      this.repeatables.set(String(params[0]), {
        id: params[0],
        queue_name: params[1],
        name: params[2],
        payload: params[3],
        cron: params[4],
        every_ms: params[5],
        start_at: params[6],
        end_at: params[7],
        limit_count: params[8],
        run_count: 0,
        next_run_at: params[10],
        active: 1,
        created_at: params[11],
        updated_at: params[12],
      });
      return;
    }

    if (normalized.startsWith('INSERT INTO cf_queue_flow_dependencies')) {
      this.dependencies.push({
        id: params[0],
        queue_name: params[1],
        parent_job_id: params[2],
        child_job_id: params[3],
        state: params[4],
      });
      return;
    }

    if (normalized.startsWith('UPDATE cf_queue_flow_dependencies SET state =')) {
      for (const dep of this.dependencies) {
        if (dep['queue_name'] === params[2] && dep['child_job_id'] === params[3]) {
          dep['state'] = params[0];
        }
      }
    }
  }

  query(sql: string, params: unknown[]): Record<string, unknown>[] {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('SELECT * FROM cf_queue_jobs WHERE queue_name = ? AND id = ?')) {
      const row = this.jobs.get(String(params[1]));
      return row !== undefined && row['queue_name'] === params[0] ? [row] : [];
    }

    if (normalized.startsWith('SELECT * FROM cf_queue_jobs WHERE queue_name = ? AND (')) {
      for (const row of this.jobs.values()) {
        if (row['queue_name'] !== params[0]) continue;
        if (
          row['id'] === params[1] ||
          (params[2] !== null && row['dedupe_key'] === params[3]) ||
          (params[4] !== null && row['idempotency_key'] === params[5])
        ) {
          return [row];
        }
      }
      return [];
    }

    if (normalized.startsWith('SELECT state, COUNT(*) AS count FROM cf_queue_jobs')) {
      const counts = new Map<string, number>();
      for (const job of this.jobs.values()) {
        if (job['queue_name'] !== params[0]) continue;
        const state = String(job['state']);
        counts.set(state, (counts.get(state) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([state, count]) => ({ state, count }));
    }

    if (normalized.startsWith('SELECT * FROM cf_queue_repeatables WHERE id = ?')) {
      const row = this.repeatables.get(String(params[0]));
      return row === undefined ? [] : [row];
    }

    if (normalized.startsWith('SELECT * FROM cf_queue_jobs WHERE queue_name = ? AND state IN')) {
      const now = String(params[1]);
      const limit = Number(params[2] ?? 100);
      return Array.from(this.jobs.values())
        .filter(
          (job) =>
            job['queue_name'] === params[0] &&
            ['waiting', 'delayed', 'prioritized', 'retrying'].includes(String(job['state'])) &&
            String(job['available_at']) <= now
        )
        .slice(0, limit);
    }

    if (normalized.startsWith("SELECT * FROM cf_queue_jobs WHERE queue_name = ? AND state = 'active'")) {
      const cutoff = String(params[1]);
      const limit = Number(params[2] ?? 100);
      return Array.from(this.jobs.values())
        .filter(
          (job) =>
            job['queue_name'] === params[0] &&
            job['state'] === 'active' &&
            String(job['updated_at']) < cutoff
        )
        .slice(0, limit);
    }

    if (normalized.startsWith('SELECT DISTINCT parent_job_id')) {
      return this.dependencies
        .filter((dep) => dep['queue_name'] === params[0] && dep['child_job_id'] === params[1])
        .map((dep) => ({ parent_job_id: dep['parent_job_id'] }));
    }

    if (normalized.startsWith('SELECT COUNT(*) AS count FROM cf_queue_flow_dependencies')) {
      return [
        {
          count: this.dependencies.filter(
            (dep) =>
              dep['queue_name'] === params[0] &&
              dep['parent_job_id'] === params[1] &&
              dep['state'] !== params[2]
          ).length,
        },
      ];
    }

    if (normalized.startsWith('SELECT jobs.*')) {
      return this.dependencies
        .filter((dep) => dep['queue_name'] === params[0] && dep['parent_job_id'] === params[1])
        .map((dep) => this.jobs.get(String(dep['child_job_id'])))
        .filter((row): row is Record<string, unknown> => row !== undefined);
    }

    return [];
  }
}

describe('adapter package queue-cloudflare state layer', () => {
  it('runs D1 migrations and creates/query jobs with BullMQ-like APIs', async () => {
    const { CloudflareQueues, CloudflareQueueMigrator } = await import(
      '../../../../packages/queue-cloudflare/src/index.js'
    );
    const d1 = new FakeD1();
    const sent: unknown[] = [];

    await CloudflareQueueMigrator.up({ d1 });
    expect(d1.statements.length).toBeGreaterThan(5);

    const queue = CloudflareQueues.create({
      driver: 'cloudflare',
      bindingName: 'EMAIL_QUEUE',
      bindings: {
        EMAIL_QUEUE: {
          send: async (body: unknown) => {
            sent.push(body);
          },
        },
      },
      state: { d1 },
    });

    const job = await queue.add('email-queue', 'send-email', { to: 'user@example.com' }, {
      attempts: 3,
      priority: 2,
    });

    expect(sent).toHaveLength(0);
    expect(await queue.getJob('email-queue', job.id)).toMatchObject({
      id: job.id,
      name: 'send-email',
      data: { to: 'user@example.com' },
    });
    expect(await queue.getJobCounts('email-queue')).toEqual({ prioritized: 1 });
  });

  it('processes jobs and releases flow parents when children complete', async () => {
    const { CloudflareQueues } = await import(
      '../../../../packages/queue-cloudflare/src/index.js'
    );
    const d1 = new FakeD1();
    const queue = CloudflareQueues.create({
      driver: 'cloudflare',
      bindingName: 'FLOW_QUEUE',
      bindings: {
        FLOW_QUEUE: { send: async () => undefined },
      },
      state: { d1 },
    });

    const flow = await queue.createFlow({
      queueName: 'flow-queue',
      parent: { name: 'parent', data: { done: false } },
      children: [{ name: 'child', data: { step: 1 } }],
    });

    const consumer = queue.createConsumer(async () => ({ ok: true }), 'flow-queue');
    const message = {
      id: flow.children[0]?.id ?? '',
      body: {
        protocol: 'zintrust.cf.queue.v1',
        jobId: flow.children[0]?.id ?? '',
        queueName: 'flow-queue',
        name: 'child',
        attempt: 0,
        availableAt: new Date().toISOString(),
      },
      attempts: 0,
      acked: false,
      retried: false,
      ack() {
        this.acked = true;
      },
      retry() {
        this.retried = true;
      },
    };

    await consumer.processBatch({ queue: 'flow-queue', messages: [message] });

    expect(message.acked).toBe(true);
    expect(await queue.getJob('flow-queue', flow.parent.id)).toMatchObject({ state: 'queued' });
    expect(await queue.getFlowChildren('flow-queue', flow.parent.id)).toHaveLength(1);
  });

  it('deduplicates jobs and uses sendBatch for bulk immediate jobs', async () => {
    const { CloudflareQueues } = await import(
      '../../../../packages/queue-cloudflare/src/index.js'
    );
    const d1 = new FakeD1();
    const batches: unknown[][] = [];
    const queue = CloudflareQueues.create({
      driver: 'cloudflare',
      bindingName: 'BATCH_QUEUE',
      bindings: {
        BATCH_QUEUE: {
          send: async () => undefined,
          sendBatch: async (messages: unknown[]) => {
            batches.push(messages);
          },
        },
      },
      state: { d1 },
    });

    const first = await queue.add('batch-queue', 'dedupe', { a: 1 }, {
      deduplication: { id: 'same' },
    });
    const second = await queue.add('batch-queue', 'dedupe', { a: 2 }, {
      deduplication: { id: 'same' },
    });

    expect(second.id).toBe(first.id);

    await queue.addBulk('batch-queue', [
      { name: 'one', data: { n: 1 } },
      { name: 'two', data: { n: 2 } },
    ]);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it('marks DLQ jobs dead_lettered and reconciles stalled jobs', async () => {
    const { CloudflareQueues, CloudflareQueueConsumer, CloudflareJobStore } = await import(
      '../../../../packages/queue-cloudflare/src/index.js'
    );
    const d1 = new FakeD1();
    const sent: unknown[] = [];
    const queue = CloudflareQueues.create({
      driver: 'cloudflare',
      bindingName: 'STALL_QUEUE',
      bindings: {
        STALL_QUEUE: {
          send: async (body: unknown) => {
            sent.push(body);
          },
        },
      },
      state: { d1 },
    });

    const job = await queue.add('stall-queue', 'work', { ok: true });
    await d1.prepare('UPDATE cf_queue_jobs SET state = ?, updated_at = ? WHERE queue_name = ? AND id = ?')
      .bind('active', new Date(Date.now() - 120_000).toISOString(), 'stall-queue', job.id)
      .run();

    const retried = await queue.reconcileStalled('stall-queue', 60_000);
    expect(retried).toBe(1);

    const dlq = CloudflareQueueConsumer.createDeadLetter({
      queueName: 'stall-queue',
      store: CloudflareJobStore.create({ d1 }),
    });
    const message = {
      id: job.id,
      body: {
        protocol: 'zintrust.cf.queue.v1',
        jobId: job.id,
        queueName: 'stall-queue',
        name: 'work',
        attempt: 1,
        availableAt: new Date().toISOString(),
      },
      attempts: 3,
      acked: false,
      ack() {
        this.acked = true;
      },
      retry() {},
    };
    await dlq.processBatch({ queue: 'stall-queue', messages: [message] });
    expect(message.acked).toBe(true);
    expect(await queue.getJob('stall-queue', job.id)).toMatchObject({ state: 'dead_lettered' });
  });
});
