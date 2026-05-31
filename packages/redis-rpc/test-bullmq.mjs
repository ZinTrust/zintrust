import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRedisRpcClient } from './client.ts';
import { listenRedisRpcServer } from './server.ts';
import { rpcServerOptions } from './env.ts';
import { createBullMqRpcQueue, createQueueMonitorRpcDriver, createRedisRpcService, createWorkerRpcRuntime } from './adapters.ts';

const settings = rpcServerOptions();
const created = await listenRedisRpcServer({
  host: settings.host,
  port: settings.port,
  secret: settings.secret,
  prefix: `redis-rpc-test-${Date.now()}`,
});

const client = createRedisRpcClient({
  baseUrl: `http://${settings.host}:${settings.port}`,
  secret: settings.secret,
});

const queueName = `redis-rpc-test-${Date.now()}`;
const workerName = `${queueName}-worker`;
const queue = createBullMqRpcQueue(queueName, { client });
const workers = createWorkerRpcRuntime({ client });
const monitor = createQueueMonitorRpcDriver({ client });
const dynamicQueue = createRedisRpcService('queue', { client, target: queueName });

try {
  assert.equal(await client.redis('ping'), 'PONG');

  await queue.obliterate({ force: true }).catch(() => undefined);
  const emptyCounts = await queue.getJobCounts();
  assert.equal(Number(emptyCounts.waiting || 0), 0);

  const dynamic = await dynamicQueue.add('dynamic', { value: 'same-method-dx' }, { removeOnComplete: false, removeOnFail: false });
  assert.equal(dynamic.name, 'dynamic');
  await dynamicQueue.removeJob(dynamic.id);

  const delayed = await queue.add('delayed', { value: 'later' }, { delay: 250, removeOnComplete: false, removeOnFail: false });
  assert.equal(delayed.name, 'delayed');
  assert.ok(delayed.id);

  const delayedCounts = await queue.getJobCounts();
  assert.ok(Number(delayedCounts.delayed || 0) >= 1);

  await queue.promoteJob(delayed.id);

  const added = await queue.add('sum', { values: [2, 5, 7] }, { removeOnComplete: false, removeOnFail: false });
  assert.ok(added.id);

  const fetched = await queue.getJob(added.id);
  assert.deepEqual(fetched.data, { values: [2, 5, 7] });

  const jobs = await queue.getJobs(['waiting', 'delayed'], 0, 10);
  assert.ok(jobs.some((job) => job.id === added.id));

  await workers.startWorker(queueName, workerName, { processor: 'sum', concurrency: 2 });

  let completed = null;
  for (let i = 0; i < 30; i += 1) {
    await sleep(200);
    completed = await queue.getJob(added.id);
    if (completed?.state === 'completed') break;
  }
  assert.equal(completed?.state, 'completed');
  assert.equal(completed?.returnvalue, 14);

  const snapshot = await monitor.getSnapshot([queueName]);
  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.queues[0].name, queueName);

  await queue.pause();
  const pausedCounts = await queue.getJobCounts();
  assert.ok('paused' in pausedCounts);
  await queue.resume();
  await workers.stopWorker(workerName);

  const failedJob = await queue.add('will-fail', { ok: false }, { attempts: 1, removeOnComplete: false, removeOnFail: false });
  await workers.startWorker(queueName, `${workerName}-fail`, { processor: 'fail' });
  let failed = null;
  for (let i = 0; i < 30; i += 1) {
    await sleep(200);
    failed = await queue.getJob(failedJob.id);
    if (failed?.state === 'failed') break;
  }
  assert.equal(failed?.state, 'failed');

  const recent = await monitor.getRecentJobsForQueue(queueName, 20);
  assert.ok(recent.some((job) => job.id === failedJob.id));

  await queue.removeJob(failedJob.id);
  assert.equal(await queue.getJob(failedJob.id), null);

  await queue.drain(true);
  await queue.clean(0, 100, 'completed');
  await workers.stopWorker(`${workerName}-fail`);
  await queue.obliterate({ force: true });

  process.stdout.write(JSON.stringify({ ok: true, queueName }, null, 2) + '\n');
} finally {
  await created.backend.close();
  created.server.closeAllConnections?.();
  await new Promise((resolve) => created.server.close(resolve));
}
