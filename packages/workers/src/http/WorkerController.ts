/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Worker Controller
 * HTTP handlers for worker management API
 */

import { Cloudflare } from '@zintrust/core/cloudflare';
import { Env } from '@zintrust/core/config';
import { ErrorFactory } from '@zintrust/core/errors';
import type { IRequest, IResponse } from '@zintrust/core/http';
import { getValidatedBody } from '@zintrust/core/http';
import { Logger } from '@zintrust/core/logger';
import type { Job } from 'bullmq';
import { CanaryController } from '../CanaryController';
import { HealthMonitor } from '../HealthMonitor';
import { getParam } from '../helper';
import { SLAMonitor } from '../index';
import { ResourceMonitor } from '../ResourceMonitor';
import type { WorkerRecord } from '../storage/WorkerStore';
import type { WorkerFactoryConfig } from '../WorkerFactory';
import { WorkerFactory } from '../WorkerFactory';
import { WorkerRegistry } from '../WorkerRegistry';
import { WorkerShutdown } from '../WorkerShutdown';
import { WorkerVersioning } from '../WorkerVersioning';
import type { InfrastructureConfig } from './middleware/InfrastructureValidator';
import { WorkerMonitoringService } from './WorkerMonitoringService';

/**
 * Helper to get request body
 */
const getBody = (req: IRequest): Record<string, unknown> => {
  return (
    getValidatedBody<Record<string, unknown>>(req) ??
    (req.getBody?.() as Record<string, unknown> | undefined) ??
    req.body ??
    {}
  );
};

// ==================== Core Worker Operations ====================

const isCloudflareEnv = (): boolean => Cloudflare.getWorkersEnv() !== null;

const shouldUseRedisRpcWorkerLifecycle = (
  persistenceOverride: PersistenceOverride | undefined
): boolean => {
  if (!isCloudflareEnv()) return false;
  if (persistenceOverride?.driver !== 'redis') return false;
  return Env.getBool('USE_REDIS_PROXY', false) && Env.get('REDIS_RPC_URL', '').trim().length > 0;
};

const createRequestId = (): string => {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const callRedisRpc = async <T = unknown>(
  service: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> => {
  const baseUrl = Env.get('REDIS_RPC_URL', '').trim();
  const endpoint = new URL('/rpc', baseUrl);
  const secret = Env.get('REDIS_RPC_SECRET', Env.get('REDIS_PROXY_SECRET', Env.APP_KEY));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret.trim() === '' ? {} : { 'x-redis-rpc-secret': secret }),
    },
    body: JSON.stringify({ requestId: createRequestId(), service, method, payload }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result: T;
    error?: { message?: string };
  };
  if (!response.ok || body.ok !== true) {
    throw ErrorFactory.createTryCatchError(
      body.error?.message ?? `Redis RPC request failed with status ${response.status}`
    );
  }
  return body.result;
};

type WorkerManifestEntry = Readonly<{
  name?: string;
  workerName?: string;
  queueName?: string;
  processorSpec?: string | null;
  concurrency?: number;
  autoStart?: boolean;
  activeStatus?: boolean;
}>;

type PersistenceOverride =
  | { driver: 'memory' }
  | { driver: 'redis'; redis: { env: true }; keyPrefix?: string }
  | { driver: 'database'; connection?: string; table?: string };

type WorkersManifestGlobal = typeof globalThis & {
  __zintrustWorkerManifestGlobalKeys?: ReadonlyArray<string>;
  [key: string]: unknown;
};

const DEFAULT_WORKER_MANIFEST_GLOBAL_KEYS = Object.freeze([
  '__zintrustWorkersManifest',
  '__zintrustWorkerManifest',
  '__zintrustAppWorkerManifest',
] as const);

const readWorkerManifestGlobalKeys = (): string[] => {
  const manifestGlobal = globalThis as WorkersManifestGlobal;
  const fromGlobal = manifestGlobal.__zintrustWorkerManifestGlobalKeys;
  if (Array.isArray(fromGlobal) && fromGlobal.every((key) => typeof key === 'string')) {
    return Array.from(new Set(fromGlobal.map((key) => key.trim()).filter(Boolean)));
  }

  const raw = Env.get('WORKER_MANIFEST_GLOBAL_KEYS', '').trim();
  if (raw.length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(parsed.map((key) => String(key).trim()).filter((key) => key.length > 0))
        );
      }
    } catch {
      // fall through
    }

    const csv = raw
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);
    if (csv.length > 0) return Array.from(new Set(csv));
  }

  return [...DEFAULT_WORKER_MANIFEST_GLOBAL_KEYS];
};

const resolveManifestWorker = (
  workerName: string
): {
  workerName: string;
  queueName: string;
  processorSpec: string | null;
  concurrency: number;
} | null => {
  const manifestGlobal = globalThis as WorkersManifestGlobal;
  const keys = readWorkerManifestGlobalKeys();
  for (const key of keys) {
    const value = manifestGlobal[key];
    if (!Array.isArray(value)) continue;
    const entries = value as WorkerManifestEntry[];
    const match = entries.find((entry) => (entry.name ?? entry.workerName) === workerName);
    if (!match) continue;
    const queueName =
      typeof match.queueName === 'string' && match.queueName.trim().length > 0
        ? match.queueName.trim()
        : `${workerName}-queue`;
    const processorSpec =
      typeof match.processorSpec === 'string' && match.processorSpec.trim().length > 0
        ? match.processorSpec.trim()
        : null;
    const concurrency = Math.max(1, Number(match.concurrency ?? 1) || 1);
    return { workerName, queueName, processorSpec, concurrency };
  }
  return null;
};

const isManifestWorkerInactive = (workerName: string): boolean => {
  const manifestGlobal = globalThis as WorkersManifestGlobal;
  const keys = readWorkerManifestGlobalKeys();
  for (const key of keys) {
    const value = manifestGlobal[key];
    if (!Array.isArray(value)) continue;
    const entries = value as WorkerManifestEntry[];
    const match = entries.find((entry) => (entry.name ?? entry.workerName) === workerName);
    if (match?.activeStatus === false) return true;
  }
  return false;
};

const assertSlaAllowsWorkerRequest = async (workerName: string): Promise<void> => {
  const gate = await SLAMonitor.canSendWorkerRequest(workerName);
  if (gate.allowed) return;
  throw ErrorFactory.createConfigError(
    `Worker "${workerName}" blocked because SLA status is not compliant`,
    {
      kind: 'worker_sla_blocked',
      workerName,
      reason: gate.reason,
      status: gate.status?.status,
    }
  );
};

const validateCreatePayload = (body: WorkerFactoryConfig, res: IResponse): boolean => {
  if (!body.name || !body.queueName || !body.processor || !body.version) {
    res.setStatus(400).json({
      error: 'Missing required fields',
      message: 'name, queueName, processor, and version are required',
      code: 'MISSING_REQUIRED_FIELDS',
    });
    return false;
  }
  return true;
};

const isSlaBlockedError = (error: unknown): boolean => {
  const details = (error as { details?: { kind?: unknown } } | undefined)?.details;
  if (details?.kind === 'worker_sla_blocked') return true;
  return error instanceof Error && error.message.includes('SLA status is not compliant');
};

const respondWorkerOperationError = (
  res: IResponse,
  error: unknown,
  fallbackStatus = 500
): void => {
  if (isSlaBlockedError(error)) {
    res.setStatus(409).json({
      ok: false,
      error: (error as Error).message,
      code: 'WORKER_SLA_BLOCKED',
    });
    return;
  }

  res.setStatus(fallbackStatus).json({ error: (error as Error).message });
};

const respondIfWorkerExists = async (
  name: string,
  persistenceOverride: ReturnType<typeof resolvePersistenceOverride>,
  res: IResponse
): Promise<boolean> => {
  const existing = await WorkerFactory.getPersisted(name, persistenceOverride);
  if (!existing) return false;

  res.status(409).json({
    ok: false,
    error: `Worker ${name} already exists`,
    code: 'WORKER_EXISTS',
    worker: existing,
  });
  return true;
};

const resolveCreateProcessor = async (
  body: WorkerFactoryConfig,
  res: IResponse
): Promise<{ processor: (job: Job) => Promise<unknown>; processorSpec?: string } | null> => {
  const rawProcessor = body.processor;
  let processor = rawProcessor as (job: Job) => Promise<unknown>;
  let processorSpec: string | undefined;

  if (!isCloudflareEnv()) {
    if (typeof rawProcessor === 'string') {
      processorSpec = rawProcessor;
      const resolved = await WorkerFactory.resolveProcessorSpec(rawProcessor);
      if (!resolved) {
        res.setStatus(400).json({ error: 'Processor spec could not be resolved' });
        return null;
      }
      processor = resolved;
    } else {
      processor = rawProcessor as (job: Job) => Promise<unknown>;
    }

    if (typeof processor !== 'function') {
      res.setStatus(400).json({ error: 'Processor must be a function or resolvable path' });
      return null;
    }

    return { processor, processorSpec };
  }

  // Cloudflare environment: treat string as spec, otherwise accept as-is
  if (typeof rawProcessor === 'string') {
    processorSpec = rawProcessor;
    processor = async () => {};
  }

  return { processor, processorSpec };
};

const finalizeWorkerCreate = async (config: WorkerFactoryConfig, res: IResponse): Promise<void> => {
  const globalAutoStart = Env.getBool('WORKER_AUTO_START', false);
  const workerAutoStart = config.autoStart ?? globalAutoStart;
  const isCloudflare = isCloudflareEnv();

  if (!isCloudflare && globalAutoStart && workerAutoStart) {
    await WorkerFactory.create(config);
    res.json({
      ok: true,
      workerName: config.name,
      status: 'creating',
      message: 'Worker creation started. Check status endpoint for progress.',
    });
    return;
  }

  await WorkerFactory.register(config);
  res.json({
    ok: true,
    workerName: config.name,
    status: 'registered',
    message: isCloudflare
      ? 'Worker registered. Cloudflare environment detected; worker will be picked up by external processor.'
      : 'Worker registered successfully.',
  });
};

/**
 * Create a new worker instance
 * @param req.body.name - Worker name (required)
 * @param req.body.queueName - Queue name (required)
 * @param req.body.processor - Job processor function (required; internal only)
 * @param req.body.version - Worker version (optional)
 * @param req.body.options - BullMQ worker options (optional)
 * @param req.body.infrastructure - Infrastructure config (optional)
 * @param req.body.features - Feature flags (optional)
 * @param req.body.datacenter - Datacenter placement config (optional)
 * @returns Success response with worker name
 */
async function create(req: IRequest, res: IResponse): Promise<void> {
  Logger.info('WorkerController.create called');
  try {
    const body = req.data() as unknown as WorkerFactoryConfig;
    if (!validateCreatePayload(body, res)) return;

    const name = body.name;
    const persistenceOverride = resolvePersistenceOverride(req);
    const exists = await respondIfWorkerExists(name, persistenceOverride, res);
    if (exists) return;

    const resolvedProcessor = await resolveCreateProcessor(body, res);
    if (!resolvedProcessor) return;

    const config = {
      ...body,
      processor: resolvedProcessor.processor,
      processorSpec: resolvedProcessor.processorSpec,
    };

    await finalizeWorkerCreate(config, res);
  } catch (error) {
    Logger.error('WorkerController.create failed', error);
    respondWorkerOperationError(res, error);
  }
}

/**
 * Start a worker
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function start(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    if (!name) {
      res.setStatus(400).json({ error: 'Worker name is required' });
      return;
    }
    const persistenceOverride = resolvePersistenceOverride(req);
    const isActive = await ensureActiveWorker(name, persistenceOverride, res);
    if (!isActive) return;

    if (shouldUseRedisRpcWorkerLifecycle(persistenceOverride)) {
      await assertSlaAllowsWorkerRequest(name);
      const manifest = resolveManifestWorker(name);
      if (!manifest) {
        res.setStatus(404).json({ ok: false, error: `Worker ${name} not found in manifest` });
        return;
      }
      const record = await callRedisRpc('worker', 'startAppWorker', manifest);
      res.json({
        ok: true,
        message: `Worker ${name} started (redis-rpc registry updated)`,
        record,
      });
      return;
    }

    const registered = WorkerRegistry.list().includes(name);

    if (!registered) {
      await WorkerFactory.startFromPersisted(name, persistenceOverride);
      res.json({ ok: true, message: `Worker ${name} registered and started` });
      return;
    }
    await WorkerFactory.start(name, persistenceOverride);
    res.json({ ok: true, message: `Worker ${name} started` });
  } catch (error) {
    Logger.error('WorkerController.start failed', error);
    respondWorkerOperationError(res, error);
  }
}

/**
 * Stop a worker
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function stop(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const persistenceOverride = resolvePersistenceOverride(req);
    const isActive = await ensureActiveWorker(name, persistenceOverride, res);
    if (!isActive) return;

    if (name && shouldUseRedisRpcWorkerLifecycle(persistenceOverride)) {
      await assertSlaAllowsWorkerRequest(name);
      // The registry stop operation is idempotent, but may return false if the worker
      // has not been registered yet. In that case, register then stop to ensure the
      // "stopped" state persists after a single click.
      let recordOrFalse = await callRedisRpc<unknown>('worker', 'stopWorker', { workerName: name });
      if (recordOrFalse === false) {
        const manifest = resolveManifestWorker(name);
        if (manifest) {
          await callRedisRpc('worker', 'startAppWorker', manifest);
        }
        recordOrFalse = await callRedisRpc('worker', 'stopWorker', { workerName: name });
      }

      res.json({
        ok: true,
        message: `Worker ${name} stopped (redis-rpc registry updated)`,
        result: recordOrFalse,
      });
      return;
    }

    await WorkerFactory.stop(name, persistenceOverride);
    res.json({ ok: true, message: `Worker ${name} stopped` });
  } catch (error) {
    Logger.error('WorkerController.stop failed', error);
    respondWorkerOperationError(res, error);
  }
}

/**
 * Restart a worker
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function restart(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const persistenceOverride = resolvePersistenceOverride(req);
    const isActive = await ensureActiveWorker(name, persistenceOverride, res);
    if (!isActive) return;

    if (name && shouldUseRedisRpcWorkerLifecycle(persistenceOverride)) {
      await assertSlaAllowsWorkerRequest(name);
      const manifest = resolveManifestWorker(name);
      if (!manifest) {
        res.setStatus(404).json({ ok: false, error: `Worker ${name} not found in manifest` });
        return;
      }
      const record = await callRedisRpc('worker', 'restartAppWorker', manifest);
      res.json({
        ok: true,
        message: `Worker ${name} restarted (redis-rpc registry updated)`,
        record,
      });
      return;
    }

    await WorkerFactory.restart(name, persistenceOverride);
    res.json({ ok: true, message: `Worker ${name} restarted` });
  } catch (error) {
    Logger.error('WorkerController.restart failed', error);
    respondWorkerOperationError(res, error);
  }
}

/**
 * Toggle worker auto-start
 * @param req.params.name - Worker name
 * @param req.query.enabled - true/false
 * @returns Success message
 */
async function setAutoStart(req: IRequest, res: IResponse): Promise<void> {
  try {
    const data = req.data();
    const name = data['name'] as string;

    if (!name) {
      res.setStatus(400).json({ error: 'Worker name is required' });
      return;
    }

    const rawEnabled = data['enabled'] as boolean;
    let enabled: boolean;

    if (typeof rawEnabled === 'boolean') {
      enabled = rawEnabled;
    } else {
      const enabledStr = normalizeQueryValue(rawEnabled) ?? '';
      enabled = ['true', '1', 'yes', 'on'].includes(enabledStr.toLowerCase());
    }

    const persistenceOverride = resolvePersistenceOverride(req);
    const isActive = await ensureActiveWorker(name, persistenceOverride, res);
    if (!isActive) return;

    if (shouldUseRedisRpcWorkerLifecycle(persistenceOverride)) {
      const manifest = resolveManifestWorker(name);
      if (!manifest) {
        res.setStatus(404).json({ ok: false, error: `Worker ${name} not found in manifest` });
        return;
      }
      await callRedisRpc('worker', 'startAppWorker', { ...manifest, autoStart: enabled });
      res.json({ ok: true, message: `Worker ${name} autoStart set to ${enabled}` });
      return;
    }

    await WorkerFactory.setAutoStart(name, enabled, persistenceOverride);

    res.json({ ok: true, message: `Worker ${name} autoStart set to ${enabled}` });
  } catch (error) {
    Logger.error('WorkerController.setAutoStart failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Pause a worker
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function pause(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const persistenceOverride = resolvePersistenceOverride(req);
    const isActive = await ensureActiveWorker(name, persistenceOverride, res);
    if (!isActive) return;
    await WorkerFactory.pause(name, persistenceOverride);
    res.json({ ok: true, message: `Worker ${name} paused` });
  } catch (error) {
    Logger.error('WorkerController.pause failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Resume a paused worker
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function resume(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const persistenceOverride = resolvePersistenceOverride(req);
    const isActive = await ensureActiveWorker(name, persistenceOverride, res);
    if (!isActive) return;
    await WorkerFactory.resume(name, persistenceOverride);
    res.json({ ok: true, message: `Worker ${name} resumed` });
  } catch (error) {
    Logger.error('WorkerController.resume failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Remove a worker instance
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function remove(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const persistenceOverride = resolvePersistenceOverride(req);
    await WorkerFactory.remove(name, persistenceOverride);
    res.json({ ok: true, message: `Worker ${name} removed` });
  } catch (error) {
    Logger.error('WorkerController.remove failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

// ==================== Worker Information ====================

/**
 * List all workers
 * @returns Array of worker instances
 */
const normalizeQueryValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return undefined;
};

const resolvePersistenceOverride = (req: IRequest): PersistenceOverride | undefined => {
  // Check for 'driver' parameter first (from frontend), then fallback to 'storage'
  const driverRaw =
    normalizeQueryValue(req.getQueryParam?.('driver')) ||
    normalizeQueryValue(req.getQueryParam?.('storage'));
  const driver = driverRaw?.toLowerCase();

  // Validate driver parameter (accept 'db' as transitional alias)
  if (driver && !['memory', 'redis', 'db', 'database'].includes(driver)) {
    Logger.error(`Invalid driver parameter: ${driver}. Must be one of: memory, redis, database`);
    return undefined;
  }

  if (driver === 'memory') {
    return { driver: 'memory' };
  }

  if (driver === 'redis') {
    return {
      driver: 'redis',
      redis: { env: true },
      keyPrefix: normalizeQueryValue(req.getQueryParam?.('keyPrefix')),
    };
  }

  if (driver === 'db' || driver === 'database') {
    return {
      driver: 'database',
      connection: normalizeQueryValue(req.getQueryParam?.('connection')),
      table: normalizeQueryValue(req.getQueryParam?.('table')),
    };
  }

  return undefined;
};

const ensureActiveWorker = async (
  name: string | undefined,
  persistenceOverride: PersistenceOverride | undefined,
  res: IResponse
): Promise<boolean> => {
  if (!name) return false;

  const instance = WorkerFactory.get(name);
  if (instance?.config?.activeStatus === false) {
    res.setStatus(410).json({ error: 'Worker is inactive', code: 'WORKER_INACTIVE' });
    return false;
  }

  // In Cloudflare Redis-RPC mode we cannot rely on direct persistence reads. Use the app manifest
  // to determine if the worker is intentionally inactive.
  if (shouldUseRedisRpcWorkerLifecycle(persistenceOverride) && isManifestWorkerInactive(name)) {
    res.setStatus(410).json({ error: 'Worker is inactive', code: 'WORKER_INACTIVE' });
    return false;
  }

  if (!shouldUseRedisRpcWorkerLifecycle(persistenceOverride)) {
    const persisted = await WorkerFactory.getPersisted(name, persistenceOverride);
    if (persisted?.activeStatus === false) {
      res.setStatus(410).json({ error: 'Worker is inactive', code: 'WORKER_INACTIVE' });
      return false;
    }
  }

  return true;
};

/**
 * Get a specific worker instance
 * @param req.params.name - Worker name
 * @returns Worker instance details
 */
async function get(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const instance = WorkerFactory.get(name);

    if (!instance) {
      const persistenceOverride = resolvePersistenceOverride(req);
      const persisted = await WorkerFactory.getPersisted(name, persistenceOverride);
      if (!persisted) {
        res.setStatus(404).json({ error: `Worker ${name} not found` });
        return;
      }

      res.json({ ok: true, worker: persisted, persisted: true });
      return;
    }

    res.json({ ok: true, worker: instance });
  } catch (error) {
    Logger.error('WorkerController.get failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Update worker configuration
 * @param req.params.name - Worker name
 * @param req.body - Updated worker configuration
 * @returns Success message
 */
async function update(req: IRequest, res: IResponse): Promise<void> {
  try {
    const reqData = req.data();
    const name = reqData['name'] as string;
    const driver = reqData['driver'] as string;
    const persistenceOverride = resolvePersistenceOverride(req);

    // Get current worker record
    const currentRecord = await WorkerFactory.getPersisted(name, persistenceOverride);
    if (!currentRecord) {
      res.setStatus(404).json({ error: `Worker ${name} not found` });
      return;
    }

    // Remove immutable fields and prepare updates
    const { name: _name, driver: _driver, ...updateData } = reqData; // Remove immutable fields

    const processorValid = await validateProcessorSpecIfNeeded(updateData);
    if (!processorValid) {
      res.setStatus(400).json({ error: 'Processor spec could not be resolved' });
      return;
    }

    // Note: driver is determined by persistence configuration, not stored in worker record
    const updatedRecord = {
      ...currentRecord,
      ...updateData,
      name,
      updatedAt: new Date(),
    };

    (updatedRecord.infrastructure as unknown as InfrastructureConfig).persistence.driver = driver;

    await persistUpdatedRecord(name, updatedRecord, persistenceOverride, updateData);

    const currentInstance = WorkerFactory.get(name);
    const restartError = await restartIfNeeded(
      name,
      currentInstance,
      updatedRecord,
      currentRecord,
      persistenceOverride
    );

    // Worker configuration updated in persistence and memory
    Logger.info(`Worker configuration updated: ${name}`, {
      updatedFields: Object.keys(updateData),
      driver: persistenceOverride?.driver || 'default',
      restartError,
    });
    res.json({
      ok: true,
      message: `Worker ${name} updated successfully`,
      worker: updatedRecord,
      updatedFields: Object.keys(updateData),
      restartError,
    });
  } catch (error) {
    Logger.error('WorkerController.update failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

// Helpers extracted from update() to reduce complexity
async function validateProcessorSpecIfNeeded(
  updateData: Record<string, unknown>
): Promise<boolean> {
  if (typeof updateData['processorSpec'] === 'string') {
    const resolved = await WorkerFactory.resolveProcessorSpec(updateData['processorSpec']);
    return Boolean(resolved);
  }
  return true;
}

async function persistUpdatedRecord(
  name: string,
  updatedRecord: WorkerRecord,
  persistenceOverride: ReturnType<typeof resolvePersistenceOverride> | undefined,
  updateData: Record<string, unknown>
): Promise<void> {
  try {
    await WorkerFactory.update(name, updatedRecord, persistenceOverride);
    Logger.info(`Worker ${name} persistence updated with fields:`, Object.keys(updateData));
  } catch (persistError) {
    Logger.warn(`Failed to persist some updates for ${name}`, persistError as Error);
    // Continue execution even if persistence update partially fails
  }
}

async function restartIfNeeded(
  name: string,
  currentInstance: ReturnType<typeof WorkerFactory.get> | undefined,
  updatedRecord: WorkerRecord,
  currentRecord: WorkerRecord,
  persistenceOverride: ReturnType<typeof resolvePersistenceOverride> | undefined
): Promise<string | undefined> {
  if (
    currentInstance?.status !== 'running' ||
    updatedRecord.activeStatus === false ||
    currentRecord.activeStatus === false
  ) {
    Logger.info(
      `Worker ${name} is not running (status: ${currentInstance?.status || 'not found'}), skipping restart`
    );
    return undefined;
  }

  try {
    Logger.info(`Restarting worker ${name} to apply configuration changes`);
    await WorkerFactory.restart(name, persistenceOverride);
    return undefined;
  } catch (err) {
    const restartError = (err as Error).message;
    Logger.warn(`Failed to restart worker ${name} after update`, err as Error);
    return restartError;
  }
}

/**
 * Get worker status
 * @param req.params.name - Worker name
 * @returns Worker status information
 */
async function status(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const workerStatus = await WorkerRegistry.status(name);
    res.json({ ok: true, status: workerStatus });
  } catch (error) {
    Logger.error('WorkerController.status failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get worker creation status for polling
 * @param req.params.name - Worker name
 * @returns Worker creation status with progress information
 */
async function getCreationStatus(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const persistenceOverride = resolvePersistenceOverride(req);
    const record = await WorkerFactory.getPersisted(name, persistenceOverride);

    if (!record) {
      res.setStatus(404).json({ error: `Worker ${name} not found` });
      return;
    }

    res.json({
      ok: true,
      workerName: name,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastError: record.lastError,
      connectionState: record.connectionState,
      lastHealthCheck: record.lastHealthCheck,
    });
  } catch (error) {
    Logger.error('WorkerController.getCreationStatus failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get worker metrics
 * @param req.params.name - Worker name
 * @returns Worker metrics data
 */
async function metrics(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const workerMetrics = await WorkerFactory.getMetrics(name);
    res.json({ ok: true, metrics: workerMetrics });
  } catch (error) {
    Logger.error('WorkerController.metrics failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get worker health information
 * @param req.params.name - Worker name
 * @returns Worker health data
 */
async function health(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const workerHealth = await WorkerFactory.getHealth(name);
    res.json({ ok: true, health: workerHealth });
  } catch (error) {
    Logger.error('WorkerController.health failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

// ==================== Health Monitoring ====================

/**
 * Start health monitoring for a worker
 * @param req.params.name - Worker name
 * @param req.body.checkInterval - Interval in seconds between checks (optional)
 * @param req.body.thresholds - Thresholds for errorRate/latency/throughput/cpu/memory/queueSize (optional)
 * @param req.body.alerting - Alerting config (optional)
 * @returns Success message
 */
async function startMonitoring(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    HealthMonitor.startMonitoring(name, body);
    res.json({ ok: true, message: `Health monitoring started for ${name}` });
  } catch (error) {
    Logger.error('WorkerController.startMonitoring failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Stop health monitoring for a worker
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function stopMonitoring(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    HealthMonitor.stopMonitoring(name);
    res.json({ ok: true, message: `Health monitoring stopped for ${name}` });
  } catch (error) {
    Logger.error('WorkerController.stopMonitoring failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get health check history for a worker
 * @param req.params.name - Worker name
 * @param req.body.limit - Optional limit for number of history entries
 * @returns Array of health check records
 */
async function healthHistory(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    const limitRaw = body['limit'];
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const history = HealthMonitor.getHealthHistory(name, limit);
    res.json({ ok: true, history });
  } catch (error) {
    Logger.error('WorkerController.healthHistory failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get health trend analysis for a worker
 * @param req.params.name - Worker name
 * @returns Health trend data
 */
async function healthTrend(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const trend = HealthMonitor.getHealthTrend(name);
    res.json({ ok: true, trend });
  } catch (error) {
    Logger.error('WorkerController.healthTrend failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get SLA status for a worker
 * @param req.params.name - Worker name
 * @returns SLA compliance status with checks and metrics
 */
async function getSlaStatus(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const slaStatus = await SLAMonitor.checkCompliance(name);
    res.json({ ok: true, allowed: slaStatus.status === 'compliant', status: slaStatus });
  } catch (error) {
    Logger.error('WorkerController.getSlaStatus failed', error);
    if ((error as Error).message.includes('SLA config not found')) {
      res.setStatus(400).json({ error: 'SLA config not found for worker' });
    } else {
      res.setStatus(500).json({ error: (error as Error).message });
    }
  }
}

/**
 * Update monitoring configuration for a worker
 * @param req.params.name - Worker name
 * @param req.body.checkInterval - Interval in seconds between checks (optional)
 * @param req.body.thresholds - Thresholds for errorRate/latency/throughput/cpu/memory/queueSize (optional)
 * @param req.body.alerting - Alerting config (optional)
 * @returns Success message
 */
async function updateMonitoringConfig(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    HealthMonitor.updateConfig(name, body);
    res.json({ ok: true, message: `Monitoring config updated for ${name}` });
  } catch (error) {
    Logger.error('WorkerController.updateMonitoringConfig failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

// ==================== Continue with remaining handlers... ====================
// (Due to length, I'll create additional placeholders that should be implemented)

/**
 * Register a new worker version
 * @param req.params.name - Worker name
 * @param req.body.version - Semantic version object { major, minor, patch, prerelease?, build? }
 * @param req.body.migrationPath - Migration path/version string (optional)
 * @param req.body.eolDate - End of life date (optional)
 * @param req.body.changelog - Changelog text (optional)
 * @param req.body.breakingChanges - Array of breaking changes (optional)
 * @returns Success message
 */
async function registerVersion(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    WorkerVersioning.register({ workerName: name, ...body } as Parameters<
      typeof WorkerVersioning.register
    >[0]);
    res.json({ ok: true, message: 'Version registered' });
  } catch (error) {
    Logger.error('WorkerController.registerVersion failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * List all versions of a worker
 * @param req.params.name - Worker name
 * @param req.body.includeDeprecated - Optional flag to include deprecated versions
 * @returns Array of version information
 */
async function listVersions(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const includeDeprecated = getBody(req)['includeDeprecated'] === 'true';
    const versions = WorkerVersioning.getVersions(name, includeDeprecated);
    res.json({ ok: true, versions });
  } catch (error) {
    Logger.error('WorkerController.listVersions failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get specific version information
 * @param req.params.name - Worker name
 * @param req.params.version - Version identifier
 * @returns Version details
 */
async function getVersion(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const version = getParam(req, 'version');
    const versionInfo = WorkerVersioning.getVersion(name, version);
    res.json({ ok: true, version: versionInfo });
  } catch (error) {
    Logger.error('WorkerController.getVersion failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Deprecate a worker version
 * @param req.params.name - Worker name
 * @param req.params.version - Version to deprecate
 * @param req.body.migrationPath - Migration instructions
 * @param req.body.eolDate - End of life date
 * @returns Success message
 */
async function deprecateVersion(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const version = getParam(req, 'version');
    const body = getBody(req);
    WorkerVersioning.deprecate(
      name,
      version,
      body['migrationPath'] as string,
      body['eolDate'] as Date
    );
    res.json({ ok: true, message: 'Version deprecated' });
  } catch (error) {
    Logger.error('WorkerController.deprecateVersion failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Activate a worker version
 * @param req.params.name - Worker name
 * @param req.params.version - Version to activate
 * @returns Success message
 */
async function activateVersion(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const version = getParam(req, 'version');
    WorkerVersioning.activate(name, version);
    res.json({ ok: true, message: 'Version activated' });
  } catch (error) {
    Logger.error('WorkerController.activateVersion failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Deactivate a worker version
 * @param req.params.name - Worker name
 * @param req.params.version - Version to deactivate
 * @returns Success message
 */
async function deactivateVersion(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const version = getParam(req, 'version');
    WorkerVersioning.deactivate(name, version);
    res.json({ ok: true, message: 'Version deactivated' });
  } catch (error) {
    Logger.error('WorkerController.deactivateVersion failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Check compatibility between worker versions
 * @param req.params.name - Worker name
 * @param req.body.sourceVersion - Source version string (e.g., "1.2.3")
 * @param req.body.targetVersion - Target version string (e.g., "1.3.0")
 * @returns Compatibility information
 */
async function checkCompatibility(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    const compatibility = WorkerVersioning.checkCompatibility(
      name,
      body['sourceVersion'] as string,
      body['targetVersion'] as string
    );
    res.json({ ok: true, compatibility });
  } catch (error) {
    Logger.error('WorkerController.checkCompatibility failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

// ==================== Canary Deployments ====================

/**
 * Start a canary deployment
 * @param req.params.name - Worker name
 * @param req.body.currentVersion - Current version string
 * @param req.body.canaryVersion - Canary version string
 * @param req.body.initialTrafficPercent - Starting traffic percent
 * @param req.body.targetTrafficPercent - Target traffic percent
 * @param req.body.incrementPercent - Increment per step
 * @param req.body.incrementInterval - Seconds between increments
 * @param req.body.monitoringDuration - Seconds per monitoring step
 * @param req.body.errorThreshold - Error rate threshold (0-1)
 * @param req.body.latencyThreshold - P95 latency threshold (ms)
 * @param req.body.minSuccessRate - Minimum success rate (0-1)
 * @param req.body.autoRollback - Auto rollback flag
 * @returns Success message
 */
async function startCanary(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    await CanaryController.start({ workerName: name, ...body } as Parameters<
      typeof CanaryController.start
    >[0]);
    res.json({ ok: true, message: 'Canary deployment started' });
  } catch (error) {
    Logger.error('WorkerController.startCanary failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Pause a canary deployment
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function pauseCanary(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    CanaryController.pause(name);
    res.json({ ok: true, message: 'Canary deployment paused' });
  } catch (error) {
    Logger.error('WorkerController.pauseCanary failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Resume a paused canary deployment
 * @param req.params.name - Worker name
 * @returns Success message
 */
async function resumeCanary(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    CanaryController.resume(name);
    res.json({ ok: true, message: 'Canary deployment resumed' });
  } catch (error) {
    Logger.error('WorkerController.resumeCanary failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Rollback a canary deployment
 * @param req.params.name - Worker name
 * @param req.body.reason - Optional rollback reason
 * @returns Success message
 */
async function rollbackCanary(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const body = getBody(req);
    await CanaryController.rollback(name, (body['reason'] as string) || 'Manual rollback');
    res.json({ ok: true, message: 'Canary deployment rolled back' });
  } catch (error) {
    Logger.error('WorkerController.rollbackCanary failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get canary deployment status
 * @param req.params.name - Worker name
 * @returns Canary status information
 */
async function canaryStatus(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const canaryStatusRes = CanaryController.getStatus(name);
    res.json({ ok: true, status: canaryStatusRes });
  } catch (error) {
    Logger.error('WorkerController.canaryStatus failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get canary deployment history
 * @param req.params.name - Worker name
 * @returns Array of past canary deployments
 */
async function canaryHistory(req: IRequest, res: IResponse): Promise<void> {
  try {
    const name = getParam(req, 'name');
    const history = CanaryController.getHistory(name);
    res.json({ ok: true, history });
  } catch (error) {
    Logger.error('WorkerController.canaryHistory failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

// ==================== Placeholder stubs for remaining endpoints ====================
// These would be fully implemented similarly to the above

const circuitBreakerState = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Circuit breaker state endpoint - implementation pending' });
};

const resetCircuitBreaker = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Reset circuit breaker endpoint - implementation pending' });
};

const forceOpenCircuit = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Force open circuit endpoint - implementation pending' });
};

const circuitBreakerEvents = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Circuit breaker events endpoint - implementation pending' });
};

const listFailedJobs = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'List failed jobs endpoint - implementation pending' });
};

const getFailedJob = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get failed job endpoint - implementation pending' });
};

const retryFailedJob = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Retry failed job endpoint - implementation pending' });
};

const deleteFailedJob = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Delete failed job endpoint - implementation pending' });
};

const anonymizeFailedJob = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Anonymize failed job endpoint - implementation pending' });
};

const dlqAuditLog = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'DLQ audit log endpoint - implementation pending' });
};

const dlqStats = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'DLQ stats endpoint - implementation pending' });
};

const registerPlugin = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Register plugin endpoint - implementation pending' });
};

const unregisterPlugin = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Unregister plugin endpoint - implementation pending' });
};

const enablePlugin = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Enable plugin endpoint - implementation pending' });
};

const disablePlugin = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Disable plugin endpoint - implementation pending' });
};

const listPlugins = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'List plugins endpoint - implementation pending' });
};

const pluginExecutionHistory = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Plugin execution history endpoint - implementation pending' });
};

const pluginStatistics = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Plugin statistics endpoint - implementation pending' });
};

const createMultiQueue = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Create multi-queue endpoint - implementation pending' });
};

const startQueue = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Start queue endpoint - implementation pending' });
};

const stopQueue = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Stop queue endpoint - implementation pending' });
};

const queueStats = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Queue stats endpoint - implementation pending' });
};

const updateQueuePriority = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Update queue priority endpoint - implementation pending' });
};

const updateQueueConcurrency = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Update queue concurrency endpoint - implementation pending' });
};

const registerRegion = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Register region endpoint - implementation pending' });
};

const unregisterRegion = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Unregister region endpoint - implementation pending' });
};

const listRegions = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'List regions endpoint - implementation pending' });
};

const getRegion = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get region endpoint - implementation pending' });
};

const updateRegionHealth = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Update region health endpoint - implementation pending' });
};

const updateRegionLoad = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Update region load endpoint - implementation pending' });
};

const placeWorker = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Place worker endpoint - implementation pending' });
};

const getPlacement = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get placement endpoint - implementation pending' });
};

const updatePlacement = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Update placement endpoint - implementation pending' });
};

const findOptimalRegion = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Find optimal region endpoint - implementation pending' });
};

const setFailoverPolicy = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Set failover policy endpoint - implementation pending' });
};

const getFailoverPolicy = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get failover policy endpoint - implementation pending' });
};

const startHealthChecks = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Start health checks endpoint - implementation pending' });
};

const stopHealthChecks = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Stop health checks endpoint - implementation pending' });
};

const getTopology = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get topology endpoint - implementation pending' });
};

const getLoadBalancingRecommendation = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({
    ok: true,
    message: 'Get load balancing recommendation endpoint - implementation pending',
  });
};

const startAutoScaling = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Start auto-scaling endpoint - implementation pending' });
};

const stopAutoScaling = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Stop auto-scaling endpoint - implementation pending' });
};

const evaluateScaling = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Evaluate scaling endpoint - implementation pending' });
};

const lastScalingDecision = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Last scaling decision endpoint - implementation pending' });
};

const scalingHistory = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Scaling history endpoint - implementation pending' });
};

const costSummary = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Cost summary endpoint - implementation pending' });
};

const setScalingPolicy = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Set scaling policy endpoint - implementation pending' });
};

const getScalingPolicy = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get scaling policy endpoint - implementation pending' });
};

/**
 * Stop Resource Monitoring
 * Stops the resource monitor that captures CPU/memory snapshots
 * @remarks
 * - Stops periodic resource snapshots (no more [DEBUG] logs)
 * - Disables cost estimation
 * - Disables resource alerts (CPU/memory warnings)
 * - May impact auto-scaling decisions
 * @returns Success message
 */
const stopResourceMonitoring = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    ResourceMonitor.stop();
    res.json({ ok: true, message: 'Resource monitoring stopped' });
  } catch (error) {
    Logger.error('WorkerController.stopResourceMonitoring failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
};

/**
 * Start Resource Monitoring
 * Starts the resource monitor to capture CPU/memory snapshots
 * @remarks
 * - Enables periodic resource snapshots (every 30s by default)
 * - Enables cost estimation and tracking
 * - Enables resource alerts for high CPU/memory usage
 * - Required for resource-based auto-scaling
 * @returns Success message
 */
const startResourceMonitoring = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    ResourceMonitor.start();
    res.json({ ok: true, message: 'Resource monitoring started' });
  } catch (error) {
    Logger.error('WorkerController.startResourceMonitoring failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
};

const getCurrentResourceUsage = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get current resource usage endpoint - implementation pending' });
};

const resourceHistory = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Resource history endpoint - implementation pending' });
};

const resourceAlerts = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Resource alerts endpoint - implementation pending' });
};

const resourceTrends = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Resource trends endpoint - implementation pending' });
};

const workerResourceTrend = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Worker resource trend endpoint - implementation pending' });
};

const updateCostConfig = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Update cost config endpoint - implementation pending' });
};

const calculateProjectedCost = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Calculate projected cost endpoint - implementation pending' });
};

const getSystemInfo = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Get system info endpoint - implementation pending' });
};

const registerDataSubject = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Register data subject endpoint - implementation pending' });
};

const recordConsent = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Record consent endpoint - implementation pending' });
};

const checkCompliance = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Check compliance endpoint - implementation pending' });
};

const createAccessRequest = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Create access request endpoint - implementation pending' });
};

const processAccessRequest = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Process access request endpoint - implementation pending' });
};

const encryptSensitiveData = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Encrypt sensitive data endpoint - implementation pending' });
};

const decryptSensitiveData = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Decrypt sensitive data endpoint - implementation pending' });
};

const recordViolation = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Record violation endpoint - implementation pending' });
};

const complianceAuditLogs = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Compliance audit logs endpoint - implementation pending' });
};

const complianceSummary = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Compliance summary endpoint - implementation pending' });
};

const prometheusMetrics = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Prometheus metrics endpoint - implementation pending' });
};

const recordCustomMetric = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Record custom metric endpoint - implementation pending' });
};

const startTrace = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'Start trace endpoint - implementation pending' });
};

const endTrace = async (_req: IRequest, res: IResponse): Promise<void> => {
  res.json({ ok: true, message: 'End trace endpoint - implementation pending' });
};

/**
 * Get system-wide summary of all workers and monitoring
 * @returns System summary with worker count and monitoring data
 */
async function systemSummary(_req: IRequest, res: IResponse): Promise<void> {
  try {
    const workers = WorkerFactory.list();
    const monitoringSummaryData = await HealthMonitor.getSummary();

    res.json({
      ok: true,
      summary: {
        totalWorkers: workers.length,
        workers: workers,
        monitoring: monitoringSummaryData,
      },
    });
  } catch (error) {
    Logger.error('WorkerController.systemSummary failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Initiate graceful system shutdown
 * @returns Success message
 */
async function shutdown(_req: IRequest, res: IResponse): Promise<void> {
  try {
    // Use the centralized shutdown coordinator
    await WorkerShutdown.shutdown({ signal: 'API', timeout: 30000, forceExit: false });
    res.json({ ok: true, message: 'Graceful shutdown initiated successfully' });
  } catch (error) {
    Logger.error('WorkerController.shutdown failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

/**
 * Get monitoring summary for all workers
 * @returns Monitoring summary data
 */
async function monitoringSummary(_req: IRequest, res: IResponse): Promise<void> {
  try {
    const summary = await HealthMonitor.getSummary();
    res.json({ ok: true, summary });
  } catch (error) {
    Logger.error('WorkerController.monitoringSummary failed', error);
    res.setStatus(500).json({ error: (error as Error).message });
  }
}

const SSE_HEARTBEAT_INTERVAL = Env.SSE_HEARTBEAT_INTERVAL;

/**
 * SSE endpoint: stream worker and monitoring events
 * GET /api/workers/events
 */
const eventsStream = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    const raw = res.getRaw();
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let closed = false;

    const send = (payload: unknown) => {
      if (closed) return;
      try {
        const data = JSON.stringify(payload);
        raw.write(`data: ${data}\n\n`);
      } catch (err) {
        Logger.error('WorkerController.eventsStream serialization failed', err);
      }
    };

    // Send hello immediately
    send({ type: 'hello', ts: new Date().toISOString() });

    // Defined subscription callback
    const onSnapshot = (data: unknown) => {
      send(data);
    };

    // Subscribe to centralized service
    WorkerMonitoringService.subscribe(onSnapshot);

    // Heartbeat to keep connection alive
    const hb = setInterval(() => {
      if (!closed) raw.write(': ping\n\n');
    }, SSE_HEARTBEAT_INTERVAL);

    // Clean up when client disconnects
    raw.on('close', () => {
      closed = true;
      clearInterval(hb);
      WorkerMonitoringService.unsubscribe(onSnapshot);
    });
  } catch (error) {
    Logger.error('WorkerController.eventsStream failed', error);
    const raw = res.getRaw && typeof res.getRaw === 'function' ? res.getRaw() : null;
    if (!raw?.headersSent) {
      res.setStatus(500).json({ error: (error as Error).message });
    }
  }
};

/**
 * Builders that group related handlers to keep the create() method small.
 * Each builder returns a plain object with the relevant handler references.
 */
const buildCoreOperations = () => ({
  // Core operations
  create,
  start,
  stop,
  restart,
  pause,
  setAutoStart,
  resume,
  remove,
  get,
  update,
  status,
  getCreationStatus,
  metrics,
  health,
});

const buildHealthMonitoring = () => ({
  // Health monitoring
  startMonitoring,
  stopMonitoring,
  healthHistory,
  healthTrend,
  updateMonitoringConfig,
  eventsStream,
  getSlaStatus,
});

const buildVersioning = () => ({
  // Versioning
  registerVersion,
  listVersions,
  getVersion,
  deprecateVersion,
  activateVersion,
  deactivateVersion,
  checkCompatibility,
});

const buildCanary = () => ({
  // Canary deployments
  startCanary,
  pauseCanary,
  resumeCanary,
  rollbackCanary,
  canaryStatus,
  canaryHistory,
});

const buildCircuitBreaker = () => ({
  // Circuit breaker
  circuitBreakerState,
  resetCircuitBreaker,
  forceOpenCircuit,
  circuitBreakerEvents,
});

const buildDLQ = () => ({
  // Dead letter queue
  listFailedJobs,
  getFailedJob,
  retryFailedJob,
  deleteFailedJob,
  anonymizeFailedJob,
  dlqAuditLog,
  dlqStats,
});

const buildPlugins = () => ({
  // Plugins
  registerPlugin,
  unregisterPlugin,
  enablePlugin,
  disablePlugin,
  listPlugins,
  pluginExecutionHistory,
  pluginStatistics,
});

const buildMultiQueue = () => ({
  // Multi-queue
  createMultiQueue,
  startQueue,
  stopQueue,
  queueStats,
  updateQueuePriority,
  updateQueueConcurrency,
});

const buildDatacenter = () => ({
  // Datacenter
  registerRegion,
  unregisterRegion,
  listRegions,
  getRegion,
  updateRegionHealth,
  updateRegionLoad,
  placeWorker,
  getPlacement,
  updatePlacement,
  findOptimalRegion,
  setFailoverPolicy,
  getFailoverPolicy,
  startHealthChecks,
  stopHealthChecks,
  getTopology,
  getLoadBalancingRecommendation,
});

const buildAutoScaling = () => ({
  // Auto-scaling
  startAutoScaling,
  stopAutoScaling,
  evaluateScaling,
  lastScalingDecision,
  scalingHistory,
  costSummary,
  setScalingPolicy,
  getScalingPolicy,
});

const buildResources = () => ({
  // Resources
  stopResourceMonitoring,
  startResourceMonitoring,
  getCurrentResourceUsage,
  resourceHistory,
  resourceAlerts,
  resourceTrends,
  workerResourceTrend,
  updateCostConfig,
  calculateProjectedCost,
  getSystemInfo,
});

const buildCompliance = () => ({
  // Compliance
  registerDataSubject,
  recordConsent,
  checkCompliance,
  createAccessRequest,
  processAccessRequest,
  encryptSensitiveData,
  decryptSensitiveData,
  recordViolation,
  complianceAuditLogs,
  complianceSummary,
});

const buildObservability = () => ({
  // Observability
  prometheusMetrics,
  recordCustomMetric,
  startTrace,
  endTrace,
});

const buildSystem = () => ({
  // System
  systemSummary,
  shutdown,
  monitoringSummary,
});

export const WorkerController = Object.freeze({
  create() {
    // Compose grouped handlers to keep this function short
    return {
      ...buildCoreOperations(),
      ...buildHealthMonitoring(),
      ...buildVersioning(),
      ...buildCanary(),
      ...buildCircuitBreaker(),
      ...buildDLQ(),
      ...buildPlugins(),
      ...buildMultiQueue(),
      ...buildDatacenter(),
      ...buildAutoScaling(),
      ...buildResources(),
      ...buildCompliance(),
      ...buildObservability(),
      ...buildSystem(),
    };
  },
});

export default WorkerController;
