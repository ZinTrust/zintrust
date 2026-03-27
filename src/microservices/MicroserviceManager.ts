/* eslint-disable @typescript-eslint/require-await */
/**
 * Microservices Architecture for ZinTrust Framework
 * Sealed namespace pattern with immutable microservice management
 */

import { Env } from '@/config/env';
import { Logger } from '@/config/logger';
import { validateUrl } from '@/security/UrlValidator';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { getServiceId, serviceMatchesAllowList } from '@microservices/ServiceManifest';

export interface MicroserviceConfig {
  id?: string;
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

function isServiceEnabledByEnv(serviceId: string, serviceName: string): boolean {
  const enabled = normalizeEnabledServices();
  return serviceMatchesAllowList(serviceId, serviceName, enabled);
}

function resolveServiceKey(lookup: string): string | undefined {
  if (services.has(lookup)) {
    return lookup;
  }

  const matches = Array.from(services.values()).filter((service) => service.name === lookup);
  if (matches.length === 0) {
    return undefined;
  }

  if (matches.length > 1) {
    throw ErrorFactory.createValidationError(
      `Ambiguous service lookup '${lookup}'. Use domain/name instead.`
    );
  }

  return matches[0]?.id;
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
  const serviceId = getServiceId(config.domain, config.name);
  if (isServiceEnabledByEnv(serviceId, config.name) === false) {
    Logger.info(`Service ${serviceId} not in SERVICES env; skipping registration`);
    return null as unknown as MicroserviceConfig;
  }

  const assignedPort = config.port ?? basePort + nextPortOffset;
  nextPortOffset += 1;

  const healthCheckUrl =
    typeof config.healthCheck === 'string'
      ? config.healthCheck
      : config.healthCheckUrl ?? '/health';

  const serviceConfig: MicroserviceConfig = {
    ...config,
    id: serviceId,
    port: assignedPort,
    baseUrl: config.baseUrl ?? `http://localhost:${assignedPort}`,
    healthCheckUrl,
    status: config.status ?? 'starting',
  };

  services.set(serviceId, serviceConfig);
  Logger.info(`Registered microservice: ${serviceId}`);
  return serviceConfig;
};

const startService = async (name: string, _handler?: unknown): Promise<boolean> => {
  const serviceKey = resolveServiceKey(name);
  const service = serviceKey === undefined ? undefined : services.get(serviceKey);
  if (service === undefined) {
    throw ErrorFactory.createNotFoundError('Service not found', { name });
  }

  service.status = 'running';
  Logger.info(`Service started: ${service.id ?? name}`);
  return true;
};

const stopService = async (name: string): Promise<boolean> => {
  const serviceKey = resolveServiceKey(name);
  const service = serviceKey === undefined ? undefined : services.get(serviceKey);
  if (service === undefined) {
    return false;
  }

  service.status = 'stopped';
  Logger.info(`Service stopped: ${service.id ?? name}`);
  return true;
};

const stopAllServices = async (): Promise<void> => {
  Logger.info('Stopping all microservices...');
  for (const service of services.values()) {
    service.status = 'stopped';
  }
};

const getService = (domain: string, name: string): MicroserviceConfig | undefined => {
  return services.get(getServiceId(domain, name));
};

const getAllServices = (): MicroserviceConfig[] => {
  return Array.from(services.values());
};

const getServicesByDomain = (domain: string): MicroserviceConfig[] => {
  return Array.from(services.values()).filter((s) => s.domain === domain);
};

const getResolvedService = (name: string): MicroserviceConfig | undefined => {
  const serviceKey = resolveServiceKey(name);
  return serviceKey === undefined ? undefined : services.get(serviceKey);
};

const getRequiredService = (name: string): MicroserviceConfig => {
  const service = getResolvedService(name);
  if (service === undefined) {
    throw ErrorFactory.createNotFoundError('Service not found', { name });
  }

  return service;
};

const assertServiceRunning = (name: string, service: MicroserviceConfig): void => {
  if (service.status === 'running') return;

  throw ErrorFactory.createConnectionError('Service not running', {
    name,
    status: service.status,
  });
};

const resolveServiceBaseUrl = (service: MicroserviceConfig): string => {
  return service.baseUrl ?? `http://localhost:${service.port ?? basePort}`;
};

const createAbortTimeout = (
  timeoutMs: number | undefined,
  controller: AbortController
): ReturnType<typeof setTimeout> | undefined => {
  if (typeof timeoutMs !== 'number') {
    return undefined;
  }

  return globalThis.setTimeout(() => controller.abort(), timeoutMs);
};

const buildRequestInit = (
  method: string,
  callOptions: ServiceCallOptions,
  signal: AbortSignal
): RequestInit => {
  const init: RequestInit = {
    method,
    headers: callOptions.headers,
    signal,
  };

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    init.body = JSON.stringify(callOptions.body ?? {});
  }

  return init;
};

const normalizeServiceResponse = async (response: {
  status: number;
  json: () => Promise<unknown>;
}): Promise<{ statusCode: number; data: unknown }> => {
  const data = await response.json().catch(() => ({}));

  return {
    statusCode: response.status,
    data,
  };
};

const callService = async (
  name: string,
  pathOrOptions: string | Record<string, unknown>,
  options?: Record<string, unknown>
): Promise<unknown> => {
  const service = getRequiredService(name);
  assertServiceRunning(name, service);

  const callOptions = toCallOptions(pathOrOptions, options);
  const pathValue = callOptions.path ?? '/';
  const method = (callOptions.method ?? 'GET').toUpperCase();

  const url = `${resolveServiceBaseUrl(service)}${pathValue}`;
  validateUrl(url);

  const controller = new AbortController();
  const timeoutId = createAbortTimeout(callOptions.timeout, controller);

  try {
    const response = await globalThis.fetch(
      url,
      buildRequestInit(method, callOptions, controller.signal)
    );
    return await normalizeServiceResponse(response);
  } catch (error) {
    Logger.error('Failed to call service', error as Error);
    throw ErrorFactory.createTryCatchError('Failed to call service', error);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};

const checkServiceHealth = async (name: string): Promise<boolean> => {
  const service = getResolvedService(name);
  if (service === undefined) {
    return false;
  }

  const healthPath = service.healthCheckUrl ?? '/health';
  const url = `${resolveServiceBaseUrl(service)}${healthPath}`;
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
      id: s.id,
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
  return Array.from(services.values());
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

  return Env.getBool('ENABLE_MICROSERVICES', false);
}

export function getEnabledServices(): string[] {
  const raw = (Env.get('SERVICES') ?? '').trim();
  if (raw.length === 0) {
    return [];
  }

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
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
