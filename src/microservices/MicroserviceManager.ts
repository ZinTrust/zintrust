/**
 * Microservices Architecture for Zintrust Framework
 * Enables domain-driven architecture with service isolation and inter-service communication
 *
 * Usage:
 * MICROSERVICES=true SERVICES=users,orders,payments
 */

import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { Kernel } from '@http/Kernel';
import { ApplicationBootstrap } from '@runtime/RuntimeDetector';
import { validateUrl } from '@security/UrlValidator';

/**
 * Microservice configuration
 */
export interface MicroserviceConfig {
  name: string; // Service identifier (e.g., 'users', 'orders')
  domain: string; // Domain folder (e.g., 'ecommerce')
  port?: number; // Optional: individual service port
  version?: string; // Service version
  dependencies?: string[]; // Other services this depends on
  healthCheck?: string; // Custom health check endpoint
}

/**
 * Service registry entry
 */
export interface ServiceRegistry {
  name: string;
  domain: string;
  kernel?: Kernel;
  baseUrl: string;
  status: 'starting' | 'running' | 'stopped' | 'failed';
  version: string;
  routes: string[];
  healthCheckUrl: string;
  lastHealthCheck?: number;
}

/**
 * Inter-service request
 */
export interface ServiceRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * Service response
 */
export interface ServiceResponse<T = unknown> {
  statusCode: number;
  headers: Record<string, string>;
  data: T;
}

/**
 * Microservice Manager - orchestrates multiple services
 */

const services: Map<string, ServiceRegistry> = new Map();
let basePortValue: number = 3000;
let managerInstance: typeof MicroserviceManager | undefined;

/**
 * Initialize microservices manager
 */
export function initialize(
  _config: MicroserviceConfig[],
  basePort?: number
): typeof MicroserviceManager {
  if (managerInstance === undefined) {
    basePortValue = basePort ?? 3000;
    managerInstance = MicroserviceManager;
  }
  return managerInstance;
}

/**
 * Get singleton instance
 */
export function getInstance(): typeof MicroserviceManager {
  managerInstance ??= initialize([]);
  if (managerInstance === undefined) {
    throw new Error('MicroserviceManager failed to initialize');
  }
  return managerInstance;
}

/**
 * Reset the manager (for testing)
 */
export function reset(): void {
  services.clear();
  managerInstance = undefined;
}

/**
 * Get services by domain
 */
export function getServicesByDomain(domain: string): ServiceRegistry[] {
  return Array.from(services.values()).filter((s) => s.domain === domain);
}

/**
 * Register a service
 */
export async function registerService(config: MicroserviceConfig): Promise<ServiceRegistry | null> {
  const enabledServices = getEnabledServices();
  if (enabledServices.includes(config.name) === false && enabledServices.length > 0) {
    Logger.info(`⊘ Service '${config.name}' not in SERVICES env - skipping`);
    return null;
  }

  const port = config.port ?? basePortValue + services.size;
  const baseUrl = `http://localhost:${port}`;
  const healthCheckUrl = config.healthCheck ?? '/health';

  const registry: ServiceRegistry = {
    name: config.name,
    domain: config.domain,
    baseUrl,
    status: 'starting',
    version: config.version ?? '1.0.0',
    routes: [],
    healthCheckUrl,
  };

  services.set(config.name, registry);
  Logger.info(`📦 Registered service: ${config.name} (${registry.baseUrl})`);

  return registry;
}

/**
 * Start a service
 */
export async function startService(
  serviceName: string,
  handler: (req: unknown, res: unknown) => Promise<void>
): Promise<void> {
  const registry = services.get(serviceName);
  if (registry === undefined) {
    throw new Error(`Service not found: ${serviceName}`);
  }

  // Load service kernel
  const kernel = await loadServiceKernel(serviceName);
  registry.kernel = kernel;

  // Start HTTP server for service
  const portStr = registry.baseUrl.split(':')[2];
  const port = portStr === undefined ? basePortValue : Number.parseInt(portStr, 10);
  Logger.info(`Starting service on port: ${port}`);
  await ApplicationBootstrap.initialize(handler);

  registry.status = 'running';
  Logger.info(`✅ Service started: ${serviceName} at ${registry.baseUrl}`);
}

/**
 * Stop a service
 */
export async function stopService(serviceName: string): Promise<void> {
  const registry = services.get(serviceName);
  if (registry !== undefined) {
    registry.status = 'stopped';
    Logger.info(`⏹  Service stopped: ${serviceName}`);
  }
}

/**
 * Stop all services
 */
export async function stopAllServices(): Promise<void> {
  for (const [name] of services) {
    await stopService(name);
  }
}

/**
 * Get service registry entry
 */
export function getService(domain: string, serviceName: string): ServiceRegistry | undefined {
  return Array.from(services.values()).find((s) => s.domain === domain && s.name === serviceName);
}

/**
 * Get all services
 */
export function getAllServices(): ServiceRegistry[] {
  return Array.from(services.values());
}

/**
 * Call another service (inter-service communication)
 */
export async function callService<T = unknown>(
  serviceName: string,
  request: ServiceRequest
): Promise<ServiceResponse<T>> {
  const service = getRunningService(serviceName);
  const url = `${service.baseUrl}${request.path}`;

  // SSRF Protection
  validateUrl(url);

  const { signal, timeoutHandle } = createAbortSignal(request.timeout ?? 5000);

  try {
    const response = await executeFetch(url, request, signal);
    clearTimeout(timeoutHandle);
    return await parseResponse<T>(response);
  } catch (error) {
    Logger.error(`Failed to call service '${serviceName}':`, error);
    throw new Error(`Failed to call service '${serviceName}': ${(error as Error).message}`);
  }
}

/**
 * Get a running service or throw
 */
function getRunningService(serviceName: string): ServiceRegistry {
  const service = services.get(serviceName);
  if (service === undefined) {
    throw new Error(`Service not found: ${serviceName}`);
  }
  if (service.status !== 'running') {
    throw new Error(`Service not running: ${serviceName}`);
  }
  return service;
}

/**
 * Create an abort signal with timeout
 */
function createAbortSignal(timeout: number): {
  signal: AbortSignal;
  timeoutHandle: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);
  return { signal: controller.signal, timeoutHandle };
}

/**
 * Execute the fetch request
 */
async function executeFetch(
  url: string,
  request: ServiceRequest,
  signal: AbortSignal
): Promise<Response> {
  return fetch(url, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Call': 'true',
      ...request.headers,
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal,
  });
}

/**
 * Parse the service response
 */
async function parseResponse<T>(response: Response): Promise<ServiceResponse<T>> {
  const data = await response.json();
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    data: data as T,
  };
}

/**
 * Check service health
 */
export async function checkServiceHealth(serviceName: string): Promise<boolean> {
  const service = services.get(serviceName);
  if (service === undefined) return false;

  const { signal, timeoutHandle } = createAbortSignal(5000);

  try {
    const response = await fetch(`${service.baseUrl}${service.healthCheckUrl}`, { signal });
    clearTimeout(timeoutHandle);

    service.lastHealthCheck = Date.now();
    return response.ok;
  } catch (error) {
    Logger.error(`Health check failed for ${serviceName}:`, (error as Error).message);
    return false;
  }
}

/**
 * Health check all services
 */
export async function healthCheckAll(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  for (const [name] of services) {
    results[name] = await checkServiceHealth(name);
  }

  return results;
}

/**
 * Get service status summary
 */
export function getStatusSummary(): Record<string, unknown> {
  const servicesList = Array.from(services.values()).map((s) => ({
    name: s.name,
    domain: s.domain,
    status: s.status,
    baseUrl: s.baseUrl,
    version: s.version,
    lastHealthCheck: s.lastHealthCheck,
  }));

  return {
    totalServices: services.size,
    runningServices: servicesList.filter((s) => s.status === 'running').length,
    services: servicesList,
  };
}

/**
 * Load service kernel from domain folder
 */
async function loadServiceKernel(serviceName: string): Promise<Kernel> {
  // Dynamically import service kernel from services/{domain}/{service}/Kernel.ts
  const service = services.get(serviceName);
  if (service === undefined) {
    throw new Error(`Service not found: ${serviceName}`);
  }
  const kernelPath = `./services/${service.domain}/${serviceName}/Kernel.ts`;

  try {
    const module = (await import(kernelPath)) as { default?: Kernel; Kernel?: Kernel };
    return module.default ?? (module.Kernel as Kernel);
  } catch (error) {
    Logger.error(`No kernel found at ${kernelPath}, using default`, error);
    // Return default kernel if not found
    const { Kernel } = await import('../http/Kernel');
    const { Router } = await import('../routing/EnhancedRouter');
    const { MiddlewareStack } = await import('../middleware/MiddlewareStack');
    const { ServiceContainer } = await import('../container/ServiceContainer');

    const container = new ServiceContainer();
    const router = new Router();
    const middlewareStack = new MiddlewareStack();

    return new Kernel(router, middlewareStack, container);
  }
}

export const MicroserviceManager = {
  initialize,
  getInstance,
  reset,
  getServicesByDomain,
  registerService,
  startService,
  stopService,
  stopAllServices,
  getService,
  getAllServices,
  callService,
  checkServiceHealth,
  healthCheckAll,
  getStatusSummary,
};

/**
 * Service discovery helper
 */

/**
 * Discover services from services/ folder
 */
export async function discoverServices(): Promise<MicroserviceConfig[]> {
  const fs = await import('node:fs').then((m) => m.promises);
  const path = await import('node:path');

  const servicesDir = path.join(process.cwd(), 'src', 'services');
  Logger.info(`🔍 Discovering services in: ${servicesDir}`);

  try {
    await fs.stat(servicesDir);
  } catch (err) {
    Logger.error('main error', err);
    Logger.error(`❌ Services directory not found: ${servicesDir}`);
    return [];
  }

  const configs: MicroserviceConfig[] = [];
  const domains = await fs.readdir(servicesDir);
  Logger.info(`📂 Found domains: ${domains.join(', ')}`);

  for (const domain of domains) {
    const domainPath = path.join(servicesDir, domain);
    const stats = await fs.stat(domainPath);

    if (stats.isDirectory() === false) continue;

    const servicesList = await fs.readdir(domainPath);
    Logger.info(`📁 Domain '${domain}' has services: ${servicesList.join(', ')}`);

    for (const serviceName of servicesList) {
      const servicePath = path.join(domainPath, serviceName);
      const serviceStats = await fs.stat(servicePath);

      if (serviceStats.isDirectory() === false) continue;

      // Check for service.config.json
      const configPath = path.join(servicePath, 'service.config.json');

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        Logger.info(`✅ Found service config for '${serviceName}'`);
        configs.push({
          name: serviceName,
          domain,
          ...config,
        });
      } catch (err) {
        // No config file, skip
        Logger.error(`No service.config.json found for '${serviceName}' at ${configPath}`, err);
      }
    }
  }

  return configs;
}

export const ServiceDiscovery = {
  discoverServices,
};

/**
 * Check if microservices are enabled
 */
export function isMicroservicesEnabled(): boolean {
  return Env.get('MICROSERVICES').toLowerCase() === 'true' || Env.getBool('ENABLE_MICROSERVICES');
}

/**
 * Get enabled service names
 */
export function getEnabledServices(): string[] {
  const servicesEnv = Env.get('SERVICES');
  return servicesEnv !== undefined && servicesEnv !== ''
    ? servicesEnv
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
    : [];
}
