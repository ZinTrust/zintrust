# Package: @zintrust/queue-cloudflare

`@zintrust/queue-cloudflare` provides a Cloudflare Queues driver for ZinTrust and an optional BullMQ-like state layer.

Install:

```bash
zin add queue:cloudflare
```

Register:

```ts
import '@zintrust/queue-cloudflare/register';
```

Basic queue usage:

```ts
import { Queue } from '@zintrust/core/queue';

await Queue.enqueue('EMAIL_QUEUE', { to: 'user@example.com' }, 'cloudflare');
```

Stateful BullMQ-like usage:

```ts
import { CloudflareQueues } from '@zintrust/queue-cloudflare';

const queue = CloudflareQueues.create({
  driver: 'cloudflare',
  bindingName: 'EMAIL_QUEUE',
  state: {
    d1BindingName: 'QUEUE_DB',
    kvBindingName: 'QUEUE_KV',
    coordinatorBindingName: 'QUEUE_COORDINATOR',
  },
});

const job = await queue.add('email-queue', 'send-email', { to: 'user@example.com' }, {
  attempts: 5,
  priority: 2,
  delay: 30000,
});

await queue.getJob('email-queue', job.id);
await queue.getJobCounts('email-queue', 'waiting', 'active', 'completed', 'failed');
```

Run D1 state migrations:

```bash
zin migrate:queue-cloudflare --database zintrust-queue --local
zin migrate:queue-cloudflare --database zintrust-queue --remote
```

Worker runtime helpers:

```ts
const consumer = queue.createConsumer(async (data, context) => {
  await context.updateProgress({ step: 'processing' });
  return await processJob(data);
}, 'email-queue');

export default {
  async queue(batch) {
    await consumer.processBatch(batch);
  },
  async scheduled() {
    await queue.runScheduler('email-queue');
  },
};
```

Cloudflare resources used by the full state layer:

- Cloudflare Queues for delivery.
- D1 for job metadata, logs, events, repeatables, and flow dependencies.
- Durable Objects for pause/resume, leases, heartbeats, and token-bucket rate limiting.
- KV for optional hot idempotency/deduplication cache.
- Cron Triggers for delayed/repeatable dispatch and reconciliation.
- DLQs for final failed message capture.

See `packages/queue-cloudflare/BULLMQ_COMPATIBILITY_PLAN.md` for the full implementation map.
