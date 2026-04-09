import { Env } from '@config/env';
import { Logger } from '@config/logger';
import {
  MicroserviceManager,
  getEnabledServices,
  isMicroservicesEnabled,
} from '@microservices/MicroserviceManager';
import {
  getServiceId,
  serviceMatchesAllowList,
  type ServiceManifestEntry,
} from '@microservices/ServiceManifest';
import fs, { fsPromises } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { ProjectRuntime } from '@runtime/ProjectRuntime';

const projectCwd = process.cwd();

/**
 * Service configuration from service.config.json
 */
export interface ServiceConfig {
  id?: string;
  name: string;
  domain: string;
  port?: number;
  version: string;
  description?: string;
  dependencies?: string[];
  healthCheck?: string;
  database?: {
    isolation: 'shared' | 'isolated'; // shared schema or separate database
    migrations: boolean;
  };
  auth?: {
    strategy: 'api-key' | 'jwt' | 'none' | 'custom'; // Multiple auth options
    secretKey?: string;
    publicKey?: string;
  };
  tracing?: {
    enabled: boolean; // Request tracing across services
    samplingRate?: number; // 0.0 to 1.0
  };
}

export interface IMicroserviceBootstrap {
  setServicesDir(dir: string): void;
  getServicesDir(): string;
  discoverServices(): Promise<ServiceConfig[]>;
  registerServices(): Promise<void>;
  getServiceConfig(domain: string, name: string): ServiceConfig | undefined;
  getAllServiceConfigs(): ServiceConfig[];
  isServiceIsolated(domain: string, name: string): boolean;
  getServiceAuthStrategy(domain: string, name: string): string;
  isTracingEnabled(domain: string, name: string): boolean;
  getTracingSamplingRate(domain: string, name: string): number;
  initialize(): Promise<void>;
}

interface BootstrapState {
  serviceConfigs: Map<string, ServiceConfig>;
  servicesDir: string;
}

/**
 * Discover services from filesystem
 */
async function runDiscoverServices(state: BootstrapState): Promise<ServiceConfig[]> {
  if (!isMicroservicesEnabled()) {
    return [];
  }

  try {
    const manifestServices = await discoverServicesFromManifest(state);
    if (manifestServices.length > 0) {
      Logger.info(`✅ Discovered ${manifestServices.length} microservices from static manifest`);
      return manifestServices;
    }

    const domains = await getDomains(state.servicesDir);
    const services = await domains.reduce<Promise<ServiceConfig[]>>(async (pending, domain) => {
      const discovered = await pending;
      const domainServices = await discoverServicesInDomain(state, domain, discovered.length);
      return [...discovered, ...domainServices];
    }, Promise.resolve([]));

    Logger.info(`✅ Discovered ${services.length} microservices`);
    return services;
  } catch (err) {
    Logger.error('Failed to discover microservices', err);
    handleDiscoveryError(err);
    return [];
  }
}

/**
 * Register discovered services with manager
 */
async function runRegisterServices(self: IMicroserviceBootstrap): Promise<void> {
  const services = await self.discoverServices();
  const manager = MicroserviceManager.getInstance();

  for (const config of services) {
    manager.register(config);
  }

  Logger.info(`📋 Registered ${services.length} services with manager`);
}

/**
 * Initialize services (discover, register, run migrations if needed)
 */
async function runInitialize(self: IMicroserviceBootstrap): Promise<void> {
  if (isMicroservicesEnabled() === false) {
    Logger.info('ℹ️  Microservices disabled (MICROSERVICES env var not set)');
    return;
  }

  Logger.info('🚀 Initializing microservices...');

  // Discover and register services
  await self.registerServices();

  // Run migrations if configured
  const services = self.getAllServiceConfigs();
  for (const config of services) {
    if (config.database?.migrations === true) {
      Logger.info(
        `📦 Service ${config.name} has migrations enabled (database isolation: ${config.database.isolation})`
      );
    }
  }

  Logger.info('✅ Microservices initialized');
}

/**
 * Microservice Bootstrap - Handles service discovery and initialization
 */
export const MicroserviceBootstrap = Object.freeze(
  (): {
    getInstance(): IMicroserviceBootstrap;
    reset(): void;
    create(): IMicroserviceBootstrap;
  } => {
    let instance: IMicroserviceBootstrap | undefined;

    return {
      getInstance(): IMicroserviceBootstrap {
        instance ??= this.create();
        return instance;
      },

      /**
       * Reset the singleton instance (for testing)
       */
      reset(): void {
        instance = undefined;
      },

      /**
       * Create a new microservice bootstrap instance
       */
      create(): IMicroserviceBootstrap {
        const state: BootstrapState = {
          serviceConfigs: new Map(),
          servicesDir: path.join(projectCwd, 'src', 'services'),
        };

        const self: IMicroserviceBootstrap = {
          /**
           * Set custom services directory
           */
          setServicesDir(dir: string): void {
            state.servicesDir = dir;
          },

          getServicesDir(): string {
            return state.servicesDir;
          },

          /**
           * Discover services from filesystem
           */
          async discoverServices(): Promise<ServiceConfig[]> {
            return runDiscoverServices(state);
          },

          /**
           * Register discovered services with manager
           */
          async registerServices(): Promise<void> {
            return runRegisterServices(this);
          },

          /**
           * Get service configuration
           */
          getServiceConfig(domain: string, name: string): ServiceConfig | undefined {
            return state.serviceConfigs.get(getServiceKey(domain, name));
          },

          /**
           * Get all discovered service configurations
           */
          getAllServiceConfigs(): ServiceConfig[] {
            return Array.from(state.serviceConfigs.values());
          },

          /**
           * Check if service has database isolation
           */
          isServiceIsolated(domain: string, name: string): boolean {
            const config = this.getServiceConfig(domain, name);
            return config?.database?.isolation === 'isolated' || false;
          },

          /**
           * Get service auth strategy
           */
          getServiceAuthStrategy(domain: string, name: string): string {
            const config = this.getServiceConfig(domain, name);
            return config?.auth?.strategy ?? 'none';
          },

          /**
           * Check if service has tracing enabled
           */
          isTracingEnabled(domain: string, name: string): boolean {
            const config = this.getServiceConfig(domain, name);
            return config?.tracing?.enabled ?? false;
          },

          /**
           * Get tracing sampling rate (0.0 to 1.0)
           */
          getTracingSamplingRate(domain: string, name: string): number {
            const config = this.getServiceConfig(domain, name);
            return config?.tracing?.samplingRate ?? 1;
          },

          /**
           * Initialize services (discover, register, run migrations if needed)
           */
          async initialize(): Promise<void> {
            return runInitialize(this);
          },
        };

        return self;
      },
    };
  }
)();

/**
 * Generate service key for registry lookup
 */
function getServiceKey(domain: string, name: string): string {
  return getServiceId(domain, name);
}

async function discoverServicesFromManifest(state: BootstrapState): Promise<ServiceConfig[]> {
  await ProjectRuntime.tryLoadNodeRuntime();
  const manifest = ProjectRuntime.getServiceManifest();
  if (manifest.length === 0) return [];

  const enabledServices = getEnabledServices();
  const discovered = manifest
    .filter((entry) => serviceMatchesAllowList(entry.id, entry.name, enabledServices))
    .map((entry, index) => createServiceConfigFromManifest(entry, index));

  state.serviceConfigs.clear();
  for (const config of discovered) {
    state.serviceConfigs.set(getServiceKey(config.domain, config.name), config);
  }

  return discovered;
}

/**
 * Get all domains in services directory
 */
async function getDomains(servicesDir: string): Promise<string[]> {
  if (!fs.existsSync(servicesDir)) return [];

  const entries = await fsPromises.readdir(servicesDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/**
 * Check if a service is enabled via environment
 */
function isServiceEnabled(serviceName: string, enabledServices: string[]): boolean {
  return enabledServices.length === 0 || enabledServices.includes(serviceName);
}

/**
 * Load service configuration from file
 */
async function loadServiceConfig(
  domain: string,
  serviceName: string,
  configPath: string,
  index: number
): Promise<ServiceConfig> {
  const configData = JSON.parse(await fsPromises.readFile(configPath, 'utf-8'));

  return {
    id: getServiceId(domain, serviceName),
    name: serviceName,
    domain,
    port: configData.port ?? 3001 + index,
    version: configData.version,
    description: configData.description,
    dependencies: configData.dependencies ?? [],
    healthCheck: configData.healthCheck ?? '/health',
    database: {
      isolation: configData.database?.isolation ?? 'shared',
      migrations: configData.database?.migrations !== false,
    },
    auth: {
      strategy: configData.auth?.strategy ?? 'none',
      secretKey: configData.auth?.secretKey,
      publicKey: configData.auth?.publicKey,
    },
    tracing: {
      enabled: configData.tracing?.enabled ?? false,
      samplingRate: configData.tracing?.samplingRate ?? 1,
    },
  };
}

function createServiceConfigFromManifest(
  entry: ServiceManifestEntry,
  index: number
): ServiceConfig {
  return {
    id: entry.id,
    name: entry.name,
    domain: entry.domain,
    port: entry.port ?? 3001 + index,
    version: entry.version ?? '1.0.0',
    description: entry.description,
    dependencies: [],
    healthCheck: entry.healthCheck ?? '/health',
    database: {
      isolation: 'shared',
      migrations: true,
    },
    auth: {
      strategy: 'none',
    },
    tracing: {
      enabled: false,
      samplingRate: 1,
    },
  };
}

/**
 * Try to load service configuration if it exists
 */
async function tryLoadServiceConfig(
  state: BootstrapState,
  domain: string,
  serviceName: string,
  domainPath: string,
  index: number
): Promise<ServiceConfig | null> {
  const configPath = path.join(domainPath, serviceName, 'service.config.json');
  if (!fs.existsSync(configPath)) return null;

  const config = await loadServiceConfig(domain, serviceName, configPath, index);
  state.serviceConfigs.set(getServiceKey(domain, serviceName), config);
  return config;
}

/**
 * Discover all services within a specific domain
 */
async function discoverServicesInDomain(
  state: BootstrapState,
  domain: string,
  startIndex: number
): Promise<ServiceConfig[]> {
  const domainPath = path.join(state.servicesDir, domain);
  const entries = await fsPromises.readdir(domainPath, { withFileTypes: true });
  const serviceNames = entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .map((entry) => entry.name);
  const enabledServices = getEnabledServices();
  const eligibleServiceNames = serviceNames.filter((serviceName) =>
    isServiceEnabled(serviceName, enabledServices)
  );

  const services = await Promise.all(
    eligibleServiceNames.map(async (serviceName, index) =>
      tryLoadServiceConfig(state, domain, serviceName, domainPath, startIndex + index)
    )
  );

  return services.filter((config): config is ServiceConfig => config !== null);
}

/**
 * Handle discovery errors gracefully
 */
function handleDiscoveryError(err: unknown): void {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    Logger.error('Error discovering services:', err);
  }
}

/**
 * Check if using shared database isolation
 */
export function isDatabaseShared(): boolean {
  return Env.DATABASE_ISOLATION !== 'isolated';
}

/**
 * Get available authentication strategies
 */
export function getAuthStrategies(): string[] {
  return ['api-key', 'jwt', 'none', 'custom'];
}

/**
 * Get available database isolations
 */
export function getDatabaseIsolations(): string[] {
  return ['shared', 'isolated'];
}

/**
 * Check if request tracing is globally enabled
 */
export function isTracingGloballyEnabled(): boolean {
  return Env.MICROSERVICES_TRACING === true;
}

/**
 * Get global tracing sampling rate
 */
export function getGlobalTracingSamplingRate(): number {
  const rate = Env.MICROSERVICES_TRACING_RATE;
  return Math.min(Math.max(rate, 0), 1); // Clamp between 0 and 1
}

export const MicroservicesConfig = {
  isDatabaseShared,
  getAuthStrategies,
  getDatabaseIsolations,
  isTracingGloballyEnabled,
  getGlobalTracingSamplingRate,
};

export default MicroserviceBootstrap;
