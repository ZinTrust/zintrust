/**
 * Observability Manager
 * Integrations for Prometheus, OpenTelemetry, and Datadog
 * Sealed namespace for immutability
 */

import type { Span, SpanOptions, Tracer } from '@opentelemetry/api';
import { ErrorFactory, Logger, generateUuid } from '@zintrust/core';
import type { Counter, Gauge, Histogram, Registry, Summary } from 'prom-client';

export type ObservabilityConfig = {
  prometheus: {
    enabled: boolean;
    port?: number;
    path?: string;
    defaultLabels?: Record<string, string>;
  };
  openTelemetry: {
    enabled: boolean;
    serviceName: string;
    exporterUrl?: string;
    sampleRate?: number; // 0-1, percentage of traces to sample
  };
  datadog: {
    enabled: boolean;
    host?: string;
    port?: number;
    prefix?: string;
    tags?: string[];
  };
};

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export type MetricDefinition = {
  name: string;
  type: MetricType;
  help: string;
  labels?: string[];
};

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
};

export type SpanAttributes = Record<string, string | number | boolean>;

// Internal state
let config: ObservabilityConfig | null = null;

// Prometheus state
let promClient: typeof import('prom-client') | null = null;
let promRegistry: Registry | null = null;
const promMetrics: Map<string, Counter | Gauge | Histogram | Summary> = new Map();

// OpenTelemetry state
let otelTracer: Tracer | null = null;
const activeSpans: Map<string, { span: Span; startedAt: number }> = new Map();
let spanSweepInterval: NodeJS.Timeout | null = null;

const MAX_ACTIVE_SPANS = 1000;
const SPAN_TTL_MS = 5 * 60 * 1000;

const cleanupStaleSpans = (): void => {
  const now = Date.now();
  for (const [spanId, entry] of activeSpans.entries()) {
    if (now - entry.startedAt > SPAN_TTL_MS) {
      entry.span.end();
      activeSpans.delete(spanId);
    }
  }
};

const evictOldestSpan = (): void => {
  if (activeSpans.size < MAX_ACTIVE_SPANS) return;

  let oldestId: string | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;

  for (const [spanId, entry] of activeSpans.entries()) {
    if (entry.startedAt < oldestTime) {
      oldestTime = entry.startedAt;
      oldestId = spanId;
    }
  }

  if (oldestId !== null) {
    const entry = activeSpans.get(oldestId);
    if (entry) {
      entry.span.end();
    }
    activeSpans.delete(oldestId);
  }
};

type DatadogClient = {
  increment: (name: string, value?: number, tags?: string[]) => void;
  gauge: (name: string, value: number, tags?: string[]) => void;
  histogram: (name: string, value: number, tags?: string[]) => void;
  timing: (name: string, value: number, tags?: string[]) => void;
  close: (callback?: () => void) => void;
};

type DatadogClientConstructor = new (options: {
  host?: string;
  port?: number;
  prefix?: string;
  globalTags?: string[];
}) => DatadogClient;

// Datadog state
let datadogClient: DatadogClient | null = null;

/**
 * Helper: Lazy load Prometheus client
 */
const getPrometheusClient = async (): Promise<typeof import('prom-client')> => {
  promClient ??= await import('prom-client');
  return promClient;
};

/**
 * Helper: Lazy load OpenTelemetry API
 */
const getOpenTelemetryApi = async (): Promise<typeof import('@opentelemetry/api')> => {
  return import('@opentelemetry/api');
};

/**
 * Helper: Initialize Prometheus
 */
const initPrometheus = async (promConfig: ObservabilityConfig['prometheus']): Promise<void> => {
  if (!promConfig.enabled) return;

  try {
    const client = await getPrometheusClient();
    promRegistry = new client.Registry();

    // Set default labels if provided
    if (promConfig.defaultLabels) {
      promRegistry.setDefaultLabels(promConfig.defaultLabels);
    }

    // Enable default metrics (process, Node.js metrics)
    client.collectDefaultMetrics({ register: promRegistry });

    Logger.info('Prometheus metrics initialized', {
      port: promConfig.port,
      path: promConfig.path ?? '/metrics',
    });
  } catch (error) {
    Logger.error('Failed to initialize Prometheus', error);
    throw error;
  }
};

/**
 * Helper: Initialize OpenTelemetry
 */
const initOpenTelemetry = async (
  otelConfig: ObservabilityConfig['openTelemetry']
): Promise<void> => {
  if (!otelConfig.enabled) return;

  try {
    const api = await getOpenTelemetryApi();
    otelTracer = api.trace.getTracer(otelConfig.serviceName);

    Logger.info('OpenTelemetry tracing initialized', {
      serviceName: otelConfig.serviceName,
      sampleRate: otelConfig.sampleRate ?? 1,
    });
  } catch (error) {
    Logger.error('Failed to initialize OpenTelemetry', error);
    // Don't throw - allow app to continue without tracing
  }
};

/**
 * Helper: Initialize Datadog
 */
const initDatadog = async (ddConfig: ObservabilityConfig['datadog']): Promise<void> => {
  if (!ddConfig.enabled) return;

  try {
    const module = (await import('hot-shots')) as unknown as { StatsD?: DatadogClientConstructor };
    const StatsDClass = module.StatsD;

    if (!StatsDClass) {
      Logger.warn('Datadog StatsD client unavailable');
      return;
    }

    datadogClient = new StatsDClass({
      host: ddConfig.host ?? 'localhost',
      port: ddConfig.port ?? 8125,
      prefix: ddConfig.prefix ?? 'worker.',
      globalTags: ddConfig.tags ?? [],
    });

    Logger.info('Datadog StatsD initialized', {
      host: ddConfig.host ?? 'localhost',
      port: ddConfig.port ?? 8125,
    });
  } catch (error) {
    Logger.error('Failed to initialize Datadog', error);
    // Don't throw - allow app to continue without Datadog
  }
};

/**
 * Observability Manager - Sealed namespace
 */
export const Observability = Object.freeze({
  /**
   * Initialize observability with configuration
   */
  async initialize(observabilityConfig: ObservabilityConfig): Promise<void> {
    if (config) {
      Logger.warn('Observability already initialized');
      return;
    }

    config = observabilityConfig;

    // Initialize all enabled platforms
    await Promise.all([
      initPrometheus(config.prometheus),
      initOpenTelemetry(config.openTelemetry),
      initDatadog(config.datadog),
    ]);

    if (config.openTelemetry.enabled === true && spanSweepInterval === null) {
      spanSweepInterval = setInterval(() => {
        cleanupStaleSpans();
      }, SPAN_TTL_MS);
    }

    Logger.info('Observability initialized', {
      prometheus: config.prometheus.enabled,
      openTelemetry: config.openTelemetry.enabled,
      datadog: config.datadog.enabled,
    });
  },

  /**
   * Register a metric
   */
  async registerMetric(definition: MetricDefinition): Promise<void> {
    if (config?.prometheus.enabled !== true || !promRegistry) {
      return;
    }

    if (promMetrics.has(definition.name)) {
      Logger.debug(`Metric already registered: ${definition.name}`);
      return;
    }

    const client = await getPrometheusClient();

    let metric: Counter | Gauge | Histogram | Summary;

    switch (definition.type) {
      case 'counter':
        metric = new client.Counter({
          name: definition.name,
          help: definition.help,
          labelNames: definition.labels ?? [],
          registers: [promRegistry],
        });
        break;

      case 'gauge':
        metric = new client.Gauge({
          name: definition.name,
          help: definition.help,
          labelNames: definition.labels ?? [],
          registers: [promRegistry],
        });
        break;

      case 'histogram':
        metric = new client.Histogram({
          name: definition.name,
          help: definition.help,
          labelNames: definition.labels ?? [],
          registers: [promRegistry],
        });
        break;

      case 'summary':
        metric = new client.Summary({
          name: definition.name,
          help: definition.help,
          labelNames: definition.labels ?? [],
          registers: [promRegistry],
        });
        break;
    }

    promMetrics.set(definition.name, metric);

    Logger.debug(`Metric registered: ${definition.name} (${definition.type})`);
  },

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    // Prometheus
    if (config?.prometheus.enabled === true && promMetrics.has(name)) {
      const metric = promMetrics.get(name) as Counter;
      if (labels) {
        metric.inc(labels, value);
      } else {
        metric.inc(value);
      }
    }

    // Datadog
    if (config?.datadog.enabled === true && datadogClient !== null) {
      const tags = labels ? Object.entries(labels).map(([k, v]) => `${k}:${v}`) : [];
      datadogClient.increment(name, value, tags);
    }
  },

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    // Prometheus
    if (config?.prometheus.enabled === true && promMetrics.has(name)) {
      const metric = promMetrics.get(name) as Gauge;
      if (labels) {
        metric.set(labels, value);
      } else {
        metric.set(value);
      }
    }

    // Datadog
    if (config?.datadog.enabled === true && datadogClient !== null) {
      const tags = labels ? Object.entries(labels).map(([k, v]) => `${k}:${v}`) : [];
      datadogClient.gauge(name, value, tags);
    }
  },

  /**
   * Record a histogram observation
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    // Prometheus
    if (config?.prometheus.enabled === true && promMetrics.has(name)) {
      const metric = promMetrics.get(name) as Histogram;
      if (labels) {
        metric.observe(labels, value);
      } else {
        metric.observe(value);
      }
    }

    // Datadog
    if (config?.datadog.enabled === true && datadogClient !== null) {
      const tags = labels ? Object.entries(labels).map(([k, v]) => `${k}:${v}`) : [];
      datadogClient.histogram(name, value, tags);
    }
  },

  /**
   * Record timing (histogram for duration)
   */
  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void {
    // Prometheus (convert to seconds)
    if (config?.prometheus.enabled === true && promMetrics.has(name)) {
      const metric = promMetrics.get(name) as Histogram;
      if (labels) {
        metric.observe(labels, durationMs / 1000);
      } else {
        metric.observe(durationMs / 1000);
      }
    }

    // Datadog (milliseconds)
    if (config?.datadog.enabled === true && datadogClient !== null) {
      const tags = labels ? Object.entries(labels).map(([k, v]) => `${k}:${v}`) : [];
      datadogClient.timing(name, durationMs, tags);
    }
  },

  /**
   * Start a span (OpenTelemetry)
   */
  startSpan(
    name: string,
    options?: { attributes?: SpanAttributes; parentSpanId?: string }
  ): string | null {
    if (config?.openTelemetry.enabled !== true || otelTracer === null) {
      return null;
    }

    try {
      const spanOptions: SpanOptions = {
        attributes: options?.attributes ?? {},
      };

      const span = otelTracer.startSpan(name, spanOptions);

      const spanId = `${name}-${Date.now()}-${generateUuid()}`;

      evictOldestSpan();
      activeSpans.set(spanId, { span, startedAt: Date.now() });

      Logger.debug(`Span started: ${name}`, { spanId });

      return spanId;
    } catch (error) {
      Logger.error('Failed to start span', error);
      return null;
    }
  },

  /**
   * End a span
   */
  endSpan(spanId: string, attributes?: SpanAttributes): void {
    if (config?.openTelemetry.enabled !== true) {
      return;
    }

    try {
      const entry = activeSpans.get(spanId);
      if (!entry) return;

      if (attributes) {
        entry.span.setAttributes(attributes);
      }

      entry.span.end();
      activeSpans.delete(spanId);

      Logger.debug(`Span ended: ${spanId}`);
    } catch (error) {
      Logger.error('Failed to end span', error);
    }
  },

  /**
   * Record an error on a span
   */
  recordSpanError(spanId: string, error: Error): void {
    if (config?.openTelemetry.enabled !== true) {
      return;
    }

    try {
      const entry = activeSpans.get(spanId);
      if (!entry) return;
      entry.span.recordException(error);
      entry.span.setStatus({ code: 2, message: error.message }); // ERROR status

      Logger.debug(`Span error recorded: ${spanId}`, { error: error.message });
    } catch (err) {
      Logger.error('Failed to record span error', err);
    }
  },

  /**
   * Add event to span
   */
  addSpanEvent(spanId: string, name: string, attributes?: SpanAttributes): void {
    if (config?.openTelemetry.enabled !== true) {
      return;
    }

    try {
      const entry = activeSpans.get(spanId);
      if (!entry) return;
      entry.span.addEvent(name, attributes);

      Logger.debug(`Span event added: ${spanId}/${name}`);
    } catch (error) {
      Logger.error('Failed to add span event', error);
    }
  },

  /**
   * Get Prometheus metrics (for HTTP endpoint)
   */
  async getPrometheusMetrics(): Promise<string> {
    if (config?.prometheus.enabled !== true || !promRegistry) {
      throw ErrorFactory.createGeneralError('Prometheus metrics not enabled');
    }

    return promRegistry.metrics();
  },

  /**
   * Get Prometheus registry (for advanced usage)
   */
  getPrometheusRegistry(): Registry | null {
    return promRegistry;
  },

  /**
   * Get Datadog client (for advanced usage)
   */
  getDatadogClient(): DatadogClient | null {
    return datadogClient;
  },

  /**
   * Get OpenTelemetry tracer (for advanced usage)
   */
  getTracer(): Tracer | null {
    return otelTracer;
  },

  /**
   * Record worker job metrics
   */
  recordJobMetrics(
    workerName: string,
    jobName: string,
    metrics: {
      processed?: number;
      failed?: number;
      durationMs?: number;
      queueSize?: number;
    }
  ): void {
    const labels = { worker: workerName, job: jobName };

    if (metrics.processed !== undefined) {
      Observability.incrementCounter('worker_jobs_processed_total', metrics.processed, labels);
    }

    if (metrics.failed !== undefined) {
      Observability.incrementCounter('worker_jobs_failed_total', metrics.failed, labels);
    }

    if (metrics.durationMs !== undefined) {
      Observability.recordTiming('worker_job_duration_seconds', metrics.durationMs, labels);
    }

    if (metrics.queueSize !== undefined) {
      Observability.setGauge('worker_queue_size', metrics.queueSize, labels);
    }
  },

  /**
   * Record worker resource metrics
   */
  recordResourceMetrics(
    workerName: string,
    resources: {
      cpuUsage?: number;
      memoryUsage?: number;
      activeJobs?: number;
    }
  ): void {
    const labels = { worker: workerName };

    if (resources.cpuUsage !== undefined) {
      Observability.setGauge('worker_cpu_usage_percent', resources.cpuUsage, labels);
    }

    if (resources.memoryUsage !== undefined) {
      Observability.setGauge('worker_memory_usage_bytes', resources.memoryUsage, labels);
    }

    if (resources.activeJobs !== undefined) {
      Observability.setGauge('worker_active_jobs', resources.activeJobs, labels);
    }
  },

  /**
   * Create a traced function wrapper
   */
  traced<T extends (...args: unknown[]) => unknown>(
    name: string,
    fn: T,
    options?: { attributes?: SpanAttributes }
  ): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const spanId = Observability.startSpan(name, options);

      try {
        const result = await fn(...args);

        if (spanId !== null) {
          Observability.endSpan(spanId, { success: true });
        }

        return result as ReturnType<T>;
      } catch (error) {
        if (spanId !== null) {
          Observability.recordSpanError(spanId, error as Error);
          Observability.endSpan(spanId, { success: false });
        }

        throw error;
      }
    }) as T;
  },

  /**
   * Get configuration
   */
  getConfig(): ObservabilityConfig | null {
    return config ? { ...config } : null;
  },

  /**
   * Check if observability is enabled
   */
  isEnabled(): boolean {
    return (
      config !== null &&
      (config.prometheus.enabled || config.openTelemetry.enabled || config.datadog.enabled)
    );
  },

  /**
   * Clear metrics for a specific worker
   */
  async clearWorkerMetrics(workerName: string): Promise<void> {
    if (config?.prometheus.enabled !== true) {
      return;
    }

    const metrics = Array.from(promMetrics.values());

    await Promise.all(
      metrics.map(async (metric) => {
        try {
          // Access internal values to find matching labels
          // This relies on prom-client get() method returning values with labels
          const item = await metric.get();
          const values = item.values ?? [];

          for (const val of values) {
            const labels = val.labels;
            if (labels?.['worker'] === workerName) {
              metric.remove(labels);
            }
          }
        } catch (err) {
          Logger.debug('Failed to clear worker metric labels', err as Error);
        }
      })
    );

    Logger.debug(`Cleared metrics for worker: ${workerName}`);
  },

  /**
   * Shutdown
   */
  shutdown(): void {
    Logger.info('Observability shutting down...');

    // Close Datadog client
    if (datadogClient !== null) {
      datadogClient.close(() => {
        Logger.debug('Datadog client closed');
      });
      datadogClient = null;
    }

    // End all active spans
    for (const [spanId, entry] of activeSpans.entries()) {
      entry.span.end();
      Logger.debug(`Span force-ended: ${spanId}`);
    }
    activeSpans.clear();

    if (spanSweepInterval) {
      clearInterval(spanSweepInterval);
      spanSweepInterval = null;
    }

    // Clear metrics
    promMetrics.clear();
    promRegistry = null;
    promClient = null;
    otelTracer = null;
    config = null;

    Logger.info('Observability shutdown complete');
  },
});

// Graceful shutdown on process termination
process.on('SIGTERM', () => {
  Observability.shutdown();
});

process.on('SIGINT', () => {
  Observability.shutdown();
});
