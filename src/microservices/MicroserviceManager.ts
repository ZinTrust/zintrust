/**
 * Microservices Architecture for Zintrust Framework
 * Sealed namespace pattern with immutable microservice management
 */

import { Env } from '@/config/env';
import { Logger } from '@/config/logger';
import { validateUrl } from '@/security/UrlValidator';
import { ErrorFactory } from '@exceptions/ZintrustError';

export interface MicroserviceConfig {
  name: string;
  domain: string;
  port?: number;
  version?: string;
  dependencies?: string[];
  status?: string;
  baseUrl?: string;
  healthCheckUrl?: string;
  healthCheck?: boolean | string;
  lastHealthCheck?: number;
}

export interface IMicroserviceManager {
  register(config: MicroserviceConfig): MicroserviceConfig;
  getService(domain: string, name: string): MicroserviceConfig | undefined;
  getAllServices(): MicroserviceConfig[];
  getServicesByDomain(domain: string): MicroserviceConfig[];
  callService(
    name: string,
    pathOrOptions: string | Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  getStatusSummary(): Record<string, unknown>;
  healthCheckAll(): Promise<Record<string, boolean>>;
  stopAllServices(): Promise<void>;
  reset(): void;
}

type ServiceCallOptions = {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
};

export interface IMicroserviceManagerFactory {
  create(): IMicroserviceManager;
  getInstance(): IMicroserviceManager;
  reset(): void;
  initialize(configs?: MicroserviceConfig[], basePort?: number): IMicroserviceManager;
  registerService(config: MicroserviceConfig): MicroserviceConfig;
  startService(name: string, handler?: unknown): Promise<boolean>;
  stopService(name: string): Promise<boolean>;
  stopAllServices(): Promise<void>;
  getService(domain: string, name: string): MicroserviceConfig | undefined;
  getAllServices(): MicroserviceConfig[];
  getServicesByDomain(domain: string): MicroserviceConfig[];
  callService(
    name: string,
    pathOrOptions: string | Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  checkServiceHealth(name: string): Promise<boolean>;
  healthCheckAll(): Promise<Record<string, boolean>>;
  getStatusSummary(): Record<string, unknown>;
  discoverServices(): Promise<MicroserviceConfig[]>;
}

const services = new Map<string, MicroserviceConfig>();
let instance: (IMicroserviceManagerFactory & IMicroserviceManager) | undefined;
let basePort = 3000;
let nextPortOffset = 0;

function normalizeEnabledServices(): string[] {
  return getEnabledServices();
}

function isServiceEnabledByEnv(serviceName: string): boolean {
  const enabled = normalizeEnabledServices();
  if (enabled.length === 0) {
    return true;
  }

  // If SERVICES is set, treat it as an allow-list.
  return enabled.includes(serviceName);
}

function toCallOptions(
  pathOrOptions: string | Record<string, unknown>,
  options: Record<string, unknown> | undefined
): ServiceCallOptions {
  if (typeof pathOrOptions === 'string') {
    return {
      method: 'GET',
      path: pathOrOptions,
      headers: (options?.['headers'] as Record<string, string> | undefined) ?? undefined,
      body: options?.['body'],
      timeout: (options?.['timeout'] as number | undefined) ?? undefined,
    };
  }

  return {
    method: (pathOrOptions['method'] as string | undefined) ?? 'GET',
    path: pathOrOptions['path'] as string | undefined,
    headers: (pathOrOptions['headers'] as Record<string, string> | undefined) ?? undefined,
    body: pathOrOptions['body'],
    timeout: (pathOrOptions['timeout'] as number | undefined) ?? undefined,
  };
}

// Plain functions (will be sealed below)
const create = (): IMicroserviceManager => {
  return getMicroserviceManager().create();
};

const getInstance = (): IMicroserviceManager => {
  instance ??= getMicroserviceManager();
  return instance;
};

const reset = (): void => {
  services.clear();
  instance = undefined;
  basePort = 3000;
  nextPortOffset = 0;
};

const initialize = (
  configs: MicroserviceConfig[] = [],
  initBasePort: number = 3000
): IMicroserviceManager => {
  instance ??= getMicroserviceManager();
  basePort = initBasePort;
  nextPortOffset = 0;

  for (const config of configs) {
    registerService(config);
  }

  return getMicroserviceManager();
};

const register = (config: MicroserviceConfig): MicroserviceConfig => {
  return registerService(config);
};

const registerService = (config: MicroserviceConfig): MicroserviceConfig => {
  if (isServiceEnabledByEnv(config.name) === false) {
    Logger.info(`Service ${config.name} not in SERVICES env; skipping registration`);
    return null as unknown as MicroserviceConfig;
  }

  const assignedPort = config.port ?? basePort + nextPortOffset;
  nextPortOffset += 1;

  const healthCheckUrl =
    typeof config.healthCheck === 'string'
      ? config.healthCheck
      : (config.healthCheckUrl ?? '/health');

  const serviceConfig: MicroserviceConfig = {
    ...config,
    port: assignedPort,
    baseUrl: config.baseUrl ?? `http://localhost:${assignedPort}`,
    healthCheckUrl,
    status: config.status ?? 'starting',
  };

  services.set(serviceConfig.name, serviceConfig);
  Logger.info(`Registered microservice: ${serviceConfig.name}`);
  return serviceConfig;
};

const startService = async (name: string, _handler?: unknown): Promise<boolean> => {
  const service = services.get(name);
  if (service === undefined) {
    return Promise.reject(ErrorFactory.createNotFoundError('Service not found', { name }));
  }

  service.status = 'running';
  Logger.info(`Service started: ${name}`);
  return Promise.resolve(true);
};

const stopService = async (name: string): Promise<boolean> => {
  const service = services.get(name);
  if (service === undefined) {
    return Promise.resolve(false);
  }

  service.status = 'stopped';
  Logger.info(`Service stopped: ${name}`);
  return Promise.resolve(true);
};

const stopAllServices = async (): Promise<void> => {
  Logger.info('Stopping all microservices...');
  for (const service of services.values()) {
    service.status = 'stopped';
  }
  return Promise.resolve();
};

const getService = (domain: string, name: string): MicroserviceConfig | undefined => {
  const service = services.get(name);
  if (service === undefined) {
    return undefined;
  }
  return service.domain === domain ? service : undefined;
};

const getAllServices = (): MicroserviceConfig[] => {
  return Array.from(services.values());
};

const getServicesByDomain = (domain: string): MicroserviceConfig[] => {
  return Array.from(services.values()).filter((s) => s.domain === domain);
};

const callService = async (
  name: string,
  pathOrOptions: string | Record<string, unknown>,
  options?: Record<string, unknown>
): Promise<unknown> => {
  const service = services.get(name);
  if (service === undefined) {
    throw ErrorFactory.createNotFoundError('Service not found', { name });
  }

  if (service.status !== 'running') {
    throw ErrorFactory.createConnectionError('Service not running', {
      name,
      status: service.status,
    });
  }

  const callOptions = toCallOptions(pathOrOptions, options);
  const path = callOptions.path ?? '/';
  const method = (callOptions.method ?? 'GET').toUpperCase();

  const resolvedBaseUrl = service.baseUrl ?? `http://localhost:${service.port ?? basePort}`;
  const url = `${resolvedBaseUrl}${path}`;
  validateUrl(url);

  const controller = new AbortController();
  const timeoutMs = callOptions.timeout;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (typeof timeoutMs === 'number') {
    // eslint-disable-next-line no-restricted-syntax
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const init: RequestInit = {
      method,
      headers: callOptions.headers,
      signal: controller.signal,
    };

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      init.body = JSON.stringify(callOptions.body ?? {});
    }

    const response = await globalThis.fetch(url, init);
    const data = await response.json().catch(() => ({}));

    return {
      statusCode: response.status,
      data,
    };
  } catch (error) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    throw ErrorFactory.createTryCatchError('Failed to call service', error);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

const checkServiceHealth = async (name: string): Promise<boolean> => {
  const service = services.get(name);
  if (service === undefined) {
    return false;
  }

  const healthPath = service.healthCheckUrl ?? '/health';
  const resolvedBaseUrl = service.baseUrl ?? `http://localhost:${service.port ?? basePort}`;
  const url = `${resolvedBaseUrl}${healthPath}`;
  validateUrl(url);

  try {
    const response = await globalThis.fetch(url, { method: 'GET' });
    const healthy = response.ok === true;
    service.lastHealthCheck = Date.now();
    return healthy;
  } catch (error) {
    service.lastHealthCheck = Date.now();
    const message = error instanceof Error ? error.message : String(error);
    Logger.error('Health check failed', message);
    return false;
  }
};

const healthCheckAll = async (): Promise<Record<string, boolean>> => {
  const names = Array.from(services.keys());
  const entries = await Promise.all(
    names.map(async (name) => [name, await checkServiceHealth(name)] as const)
  );
  return Object.fromEntries(entries) as Record<string, boolean>;
};

const getStatusSummary = (): Record<string, unknown> => {
  const allServices = Array.from(services.values());
  const runningServices = allServices.filter((s) => s.status === 'running').length;

  return {
    totalServices: allServices.length,
    runningServices,
    services: allServices.map((s) => ({
      name: s.name,
      domain: s.domain,
      version: s.version,
      status: s.status,
      lastHealthCheck: s.lastHealthCheck,
    })),
    timestamp: Date.now(),
  };
};

const discoverServices = async (): Promise<MicroserviceConfig[]> => {
  return Promise.resolve(Array.from(services.values()));
};

const getMicroserviceManager = (): IMicroserviceManagerFactory & IMicroserviceManager =>
  MicroserviceManager;

export const MicroserviceManager: IMicroserviceManagerFactory & IMicroserviceManager =
  Object.freeze({
    create,
    getInstance,
    reset,
    initialize,
    register,
    registerService,
    startService,
    stopService,
    stopAllServices,
    getService,
    getAllServices,
    getServicesByDomain,
    callService,
    checkServiceHealth,
    healthCheckAll,
    getStatusSummary,
    discoverServices,
  });

export function isMicroservicesEnabled(): boolean {
  const direct = (Env.get('MICROSERVICES') ?? '').trim();
  if (direct.toLowerCase() === 'true') {
    return true;
  }

  // Fallback flag used in tests/legacy setups.
  return Env.getBool('ENABLE_MICROSERVICES', false);
}

export function getEnabledServices(): string[] {
  const raw = (Env.get('SERVICES') ?? '').trim();
  if (raw.length === 0) {
    return [];
  }

  return raw
    .split(',')
    .map((service) => service.trim())
    .filter((service) => service.length > 0);
}

// Re-export functions for backward compatibility
export {
  callService,
  checkServiceHealth,
  create,
  discoverServices,
  getAllServices,
  getInstance,
  getService,
  getServicesByDomain,
  getStatusSummary,
  healthCheckAll,
  initialize,
  register,
  registerService,
  reset,
  startService,
  stopAllServices,
  stopService,
};

export default MicroserviceManager;
