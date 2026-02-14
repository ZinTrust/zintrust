/**
 * Workers Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */
// @ts-ignore - config templates are excluded from the main TS project in this repo
import { Env } from '@config/env';
import type { WorkersConfigOverrides } from '@zintrust/workers';

export default {
  driver: Env.get('WORKER_PERSISTENCE_DRIVER', 'memory'),
  middleware: Env.get('QUEUE_MONITOR_MIDDLEWARE', '')
    .split(',')
    .map((m: string) => m.trim())
    .filter((m: string) => m.length > 0) as ReadonlyArray<string>,
  enabled: Env.getBool('WORKERS_ENABLED', true),
  healthCheckInterval: Env.getInt('WORKERS_HEALTH_CHECK_INTERVAL', 60),
  clusterMode: Env.getBool('WORKERS_CLUSTER_MODE', false),

  autoScaling: {
    enabled: Env.getBool('WORKER_AUTO_SCALING_ENABLED', false),
    interval: Env.getInt('WORKER_AUTO_SCALING_INTERVAL', 30),
    offPeakSchedule: Env.get('WORKER_OFF_PEAK_SCHEDULE', '22:00-06:00'),
    offPeakReduction: Env.getFloat('WORKER_OFF_PEAK_REDUCTION', 0.7),
  },

  costOptimization: {
    enabled: Env.getBool('WORKER_COST_OPTIMIZATION_ENABLED', false),
    spotInstances: Env.getBool('WORKER_SPOT_INSTANCES', false),
    offPeakScaling: Env.getBool('WORKER_OFF_PEAK_SCALING', false),
  },

  compliance: {
    auditLog: Env.getBool('WORKER_AUDIT_LOG', true),
    encryption: Env.getBool('WORKER_ENCRYPTION', true),
    dataRetention: Env.getInt('WORKER_DATA_RETENTION', 90),
    gdpr: Env.getBool('WORKER_GDPR', false),
    hipaa: Env.getBool('WORKER_HIPAA', false),
    soc2: Env.getBool('WORKER_SOC2', true),
  },

  observability: {
    prometheus: {
      enabled: Env.getBool('WORKER_PROMETHEUS_ENABLED', false),
      port: Env.getInt('WORKER_PROMETHEUS_PORT', 9090),
    },
    opentelemetry: {
      enabled: Env.getBool('WORKER_OPENTELEMETRY_ENABLED', false),
      endpoint: Env.get('WORKER_OPENTELEMETRY_ENDPOINT', 'http://localhost:4318'),
    },
    datadog: {
      enabled: Env.getBool('WORKER_DATADOG_ENABLED', false),
      apiKey: Env.get('WORKER_DATADOG_API_KEY', ''),
    },
  },

  defaultWorker: {
    enabled: Env.getBool('WORKER_ENABLED', true),
    concurrency: Env.getInt('WORKER_CONCURRENCY', 5),
    timeout: Env.getInt('WORKER_TIMEOUT', 60),
    retries: Env.getInt('WORKER_RETRIES', 3),
    autoStart: Env.getBool('WORKER_AUTO_START', false),
    priority: Env.getInt('WORKER_PRIORITY', 1),
    healthCheckInterval: Env.getInt('WORKER_HEALTH_CHECK_INTERVAL', 60),
    clusterMode: Env.getBool('WORKER_CLUSTER_MODE', true),
    region: Env.get('WORKER_REGION', 'us-east-1'),
  },

  // Per-worker overrides
  workers: {
    // Example: Customize 'test' worker
    // test: {
    //   enabled: true,
    //   concurrency: 3,
    //   autoStart: true,
    //   priority: 5,
    //   queues: ['test', 'test-backup'],
    //   region: 'us-east-1',
    //   autoScaling: {
    //     enabled: true,
    //     minWorkers: 1,
    //     maxWorkers: 5,
    //     queueThreshold: 100,
    //     scaleUpCooldown: 60,
    //     scaleDownCooldown: 300,
    //   },
    // },
  },
} satisfies WorkersConfigOverrides;
