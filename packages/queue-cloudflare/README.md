# @zintrust/queue-cloudflare

Cloudflare Queues driver for ZinTrust.

```ts
import '@zintrust/queue-cloudflare/register';
import { Queue } from '@zintrust/core/queue';

await Queue.enqueue('EMAIL_QUEUE', { to: 'user@example.com' }, 'cloudflare');
```

BullMQ-like stateful jobs are available through the package driver:

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

const job = await queue.add(
  'email-queue',
  'send-email',
  { to: 'user@example.com' },
  {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    priority: 2,
    delay: 30000,
  }
);

await queue.getJob('email-queue', job.id);
await queue.getJobCounts('email-queue', 'waiting', 'active', 'completed', 'failed');
```

Inside a Cloudflare Worker, bind the queue in `wrangler.jsonc`:

```jsonc
{
  "queues": {
    "producers": [{ "queue": "email-queue", "binding": "EMAIL_QUEUE" }],
    "consumers": [
      {
        "queue": "email-queue",
        "max_batch_size": 10,
        "max_retries": 3,
        "dead_letter_queue": "email-dlq",
      },
    ],
  },
}
```

Add the state bindings when using BullMQ-like metadata:

```jsonc
{
  "d1_databases": [
    {
      "binding": "QUEUE_DB",
      "database_name": "zintrust-queue",
      "database_id": "<database-id>",
    },
  ],
  "kv_namespaces": [
    {
      "binding": "QUEUE_KV",
      "id": "<namespace-id>",
    },
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "QUEUE_COORDINATOR",
        "class_name": "CloudflareQueueCoordinator",
      },
    ],
  },
  "migrations": [
    {
      "tag": "queue-cloudflare-v1",
      "new_sqlite_classes": ["CloudflareQueueCoordinator"],
    },
  ],
  "triggers": {
    "crons": ["* * * * *"],
  },
}
```

Run the D1 state migration:

```bash
zin migrate:queue-cloudflare --database zintrust-queue --local
zin migrate:queue-cloudflare --database zintrust-queue --remote
```

The same migration is available programmatically:

```ts
import { CloudflareQueueMigrator } from '@zintrust/queue-cloudflare';

await CloudflareQueueMigrator.up({ d1: env.QUEUE_DB });
```

Use the Worker queue consumer helper:

```ts
const consumer = queue.createConsumer(async (data, context) => {
  await context.updateProgress({ step: 'sending' });
  return await sendEmail(data);
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

For HTTP pull consumers or non-Worker producers, configure Cloudflare API access:

```ts
import { CloudflareQueues } from '@zintrust/queue-cloudflare';

const queue = CloudflareQueues.create({
  driver: 'cloudflare',
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  queueId: process.env.CLOUDFLARE_QUEUE_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  batchSize: 1,
  visibilityTimeoutMs: 30000,
});

const jobId = await queue.enqueue('email-queue', { to: 'user@example.com' });
const message = await queue.dequeue('email-queue');
if (message) await queue.ack('email-queue', message.id);
```

Environment fallbacks:

- `CLOUDFLARE_QUEUE_BINDING` or `QUEUE_BINDING`
- `CLOUDFLARE_ACCOUNT_ID` or `CF_ACCOUNT_ID`
- `CLOUDFLARE_QUEUE_ID` or `CF_QUEUE_ID`
- `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN`
- `CLOUDFLARE_API_BASE_URL`

The driver registers as both `cloudflare` and `cloudflare-queues`.
