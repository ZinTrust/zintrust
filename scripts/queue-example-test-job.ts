import { Queue } from 'bullmq';
import { EnvFileLoader } from '../src/cli/utils/EnvFileLoader';

const QUEUE_NAME = 'example-queue';
const JOB_NAME = 'example-test';

const buildConnection = (queueConfig: {
  drivers: {
    redis?: { driver: string; host: string; port: number; password?: string; database: number };
  };
}): { host: string; port: number; password?: string; db: number } => {
  const redis = queueConfig.drivers.redis;
  if (!redis || redis.driver !== 'redis') {
    throw new Error(
      'Redis queue driver is not configured. Set QUEUE_DRIVER=redis and REDIS_* envs.'
    );
  }

  return {
    host: redis.host,
    port: redis.port,
    db: redis.database,
    password: redis.password || undefined,
  };
};

const run = async (): Promise<void> => {
  EnvFileLoader.ensureLoaded();
  const queueConfig = (await import('../config/queue')).default;
  const queue = new Queue(QUEUE_NAME, {
    connection: buildConnection(queueConfig),
  });

  const job = await queue.add(JOB_NAME, {
    to: 'test@example.com',
    subject: 'Example job from script',
    body: 'Hello from example-test job runner',
  });

  console.log(`Queued job ${String(job.id)} on ${QUEUE_NAME}`);
  await queue.close();
};

run().catch((error) => {
  console.error('Failed to enqueue job', error);
  process.exit(1);
});
