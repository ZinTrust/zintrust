import assert from 'node:assert/strict';
import { createRedisRpcClient } from './src/client.ts';
import { listenRedisRpcServer } from './src/server.ts';
import { rpcServerOptions } from './src/env.ts';
import { createBullMqRpcQueue, createQueueMonitorRpcDriver, createRedisRpcService, createWorkerRpcRuntime } from './src/adapters.ts';

const settings = rpcServerOptions();
const secret = settings.secret || 'redis-rpc-test-secret';
const created = await listenRedisRpcServer({
  host: settings.host,
  port: settings.port,
  secret,
  prefix: `redis-rpc-test-${Date.now()}`,
});

const client = createRedisRpcClient({
  baseUrl: `http://${settings.host}:${settings.port}`,
  secret,
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

  const startedWorker = await workers.startWorker(queueName, workerName, { processor: 'sum', concurrency: 2 });
  assert.equal(startedWorker.status, 'running');
  assert.equal(startedWorker.processorSpec, null);
  const listedWorkers = await workers.list();
  assert.ok(listedWorkers.some((worker) => worker.workerName === workerName && worker.queueName === queueName));

  let claimed;
  for (let i = 0; i < 5; i += 1) {
    claimed = await queue.dequeue(30_000);
    assert.ok(claimed);
    if (claimed.id === String(added.id)) break;
    await queue.ack(claimed.id, { skipped: true });
  }
  assert.equal(claimed.id, String(added.id));
  assert.equal(claimed.name, 'sum');
  assert.deepEqual(claimed.payload, { values: [2, 5, 7] });
  await queue.ack(claimed.id, 14);
  const completed = await queue.getJob(added.id);
  assert.equal(completed?.state, 'completed');
  assert.equal(completed?.returnvalue, 14);

  const snapshot = await monitor.getSnapshot([queueName]);
  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.queues[0].name, queueName);

  await queue.pause();
  const pausedCounts = await queue.getJobCounts();
  assert.ok('paused' in pausedCounts);
  await queue.resume();
  const stoppedWorker = await workers.stopWorker(workerName);
  assert.equal(stoppedWorker.status, 'stopped');

  const failedJob = await queue.add('will-fail', { ok: false }, { attempts: 1, removeOnComplete: false, removeOnFail: false });
  await workers.startWorker(queueName, `${workerName}-fail`, { processor: 'fail' });
  const failedClaim = await queue.dequeue(30_000);
  assert.equal(failedClaim.id, String(failedJob.id));
  await queue.fail(failedClaim.id, 'expected smoke failure');
  const failed = await queue.getJob(failedJob.id);
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
