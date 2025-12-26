import { Env } from '@config/env';
import { Logger } from '@config/logger';
import {
  MicroserviceManager,
  getEnabledServices,
  isMicroservicesEnabled,
} from '@microservices/MicroserviceManager';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

/**
 * Service configuration from service.config.json
 */
export interface ServiceConfig {
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
    return Promise.resolve([]);
  }

  try {
    const domains = getDomains(state.servicesDir);
    const services: ServiceConfig[] = [];

    for (const domain of domains) {
      const domainServices = discoverServicesInDomain(state, domain, services.length);
      services.push(...domainServices);
    }

    Logger.info(`✅ Discovered ${services.length} microservices`);
    return Promise.resolve(services);
  } catch (err) {
    Logger.error('Failed to discover microservices', err);
    handleDiscoveryError(err);
    return Promise.resolve([]);
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
          servicesDir: path.join(process.cwd(), 'src', 'services'),
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
  return `${domain}/${name}`;
}

/**
 * Get all domains in services directory
 */
function getDomains(servicesDir: string): string[] {
  if (!fs.existsSync(servicesDir)) return [];

  return fs.readdirSync(servicesDir).filter((file) => {
    const filePath = path.join(servicesDir, file);
    return fs.statSync(filePath).isDirectory();
  });
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
function loadServiceConfig(
  domain: string,
  serviceName: string,
  configPath: string,
  index: number
): ServiceConfig {
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  return {
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

/**
 * Try to load service configuration if it exists
 */
function tryLoadServiceConfig(
  state: BootstrapState,
  domain: string,
  serviceName: string,
  domainPath: string,
  index: number
): ServiceConfig | null {
  const configPath = path.join(domainPath, serviceName, 'service.config.json');
  if (!fs.existsSync(configPath)) return null;

  const config = loadServiceConfig(domain, serviceName, configPath, index);
  state.serviceConfigs.set(getServiceKey(domain, serviceName), config);
  return config;
}

/**
 * Discover all services within a specific domain
 */
function discoverServicesInDomain(
  state: BootstrapState,
  domain: string,
  startIndex: number
): ServiceConfig[] {
  const domainPath = path.join(state.servicesDir, domain);
  const serviceNames = fs.readdirSync(domainPath).filter((file) => {
    const filePath = path.join(domainPath, file);
    return fs.statSync(filePath).isDirectory() && file !== 'shared';
  });

  const services: ServiceConfig[] = [];
  const enabledServices = getEnabledServices();

  for (const serviceName of serviceNames) {
    if (isServiceEnabled(serviceName, enabledServices)) {
      const config = tryLoadServiceConfig(
        state,
        domain,
        serviceName,
        domainPath,
        startIndex + services.length
      );
      if (config) services.push(config);
    }
  }

  return services;
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
