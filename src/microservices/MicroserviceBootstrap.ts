import { Env } from '@config/env';
import { Logger } from '@config/logger';
import {
  MicroserviceManager,
  getEnabledServices,
  isMicroservicesEnabled,
} from '@microservices/MicroserviceManager';
import fs from 'node:fs';
import path from 'node:path';

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

/**
 * Microservice Bootstrap - Handles service discovery and initialization
 */
export class MicroserviceBootstrap {
  private static instance: MicroserviceBootstrap | undefined;
  private readonly serviceConfigs: Map<string, ServiceConfig> = new Map();
  private servicesDir: string = path.join(process.cwd(), 'src', 'services');

  private constructor() {}

  public static getInstance(): MicroserviceBootstrap {
    MicroserviceBootstrap.instance ??= new MicroserviceBootstrap();
    return MicroserviceBootstrap.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static reset(): void {
    MicroserviceBootstrap.instance = undefined;
  }

  /**
   * Set custom services directory
   */
  public setServicesDir(dir: string): void {
    this.servicesDir = dir;
  }

  public getServicesDir(): string {
    return this.servicesDir;
  }

  /**
   * Discover services from filesystem
   */
  public async discoverServices(): Promise<ServiceConfig[]> {
    if (!isMicroservicesEnabled()) {
      return [];
    }

    try {
      const domains = this.getDomains();
      const services: ServiceConfig[] = [];

      for (const domain of domains) {
        const domainServices = this.discoverServicesInDomain(domain, services.length);
        services.push(...domainServices);
      }

      Logger.info(`✅ Discovered ${services.length} microservices`);
      return services;
    } catch (err) {
      Logger.error('Failed to discover microservices', err);
      this.handleDiscoveryError(err);
      return [];
    }
  }

  /**
   * Get all domains in services directory
   */
  private getDomains(): string[] {
    if (!fs.existsSync(this.servicesDir)) return [];

    return fs.readdirSync(this.servicesDir).filter((file) => {
      const filePath = path.join(this.servicesDir, file);
      return fs.statSync(filePath).isDirectory();
    });
  }

  /**
   * Discover all services within a specific domain
   */
  private discoverServicesInDomain(domain: string, startIndex: number): ServiceConfig[] {
    const domainPath = path.join(this.servicesDir, domain);
    const serviceNames = fs.readdirSync(domainPath).filter((file) => {
      const filePath = path.join(domainPath, file);
      return fs.statSync(filePath).isDirectory() && file !== 'shared';
    });

    const services: ServiceConfig[] = [];
    const enabledServices = getEnabledServices();

    for (const serviceName of serviceNames) {
      if (this.isServiceEnabled(serviceName, enabledServices)) {
        const config = this.tryLoadServiceConfig(
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
   * Check if a service is enabled via environment
   */
  private isServiceEnabled(serviceName: string, enabledServices: string[]): boolean {
    return enabledServices.length === 0 || enabledServices.includes(serviceName);
  }

  /**
   * Try to load service configuration if it exists
   */
  private tryLoadServiceConfig(
    domain: string,
    serviceName: string,
    domainPath: string,
    index: number
  ): ServiceConfig | null {
    const configPath = path.join(domainPath, serviceName, 'service.config.json');
    if (!fs.existsSync(configPath)) return null;

    const config = this.loadServiceConfig(domain, serviceName, configPath, index);
    this.serviceConfigs.set(this.getServiceKey(domain, serviceName), config);
    return config;
  }

  /**
   * Handle discovery errors gracefully
   */
  private handleDiscoveryError(err: unknown): void {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      Logger.error('Error discovering services:', err);
    }
  }

  /**
   * Load service configuration from file
   */
  private loadServiceConfig(
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
   * Register discovered services with manager
   */
  public async registerServices(): Promise<void> {
    const services = await this.discoverServices();
    const manager = MicroserviceManager.getInstance();

    for (const config of services) {
      manager.registerService(config);
    }

    Logger.info(`📋 Registered ${services.length} services with manager`);
  }

  /**
   * Get service configuration
   */
  public getServiceConfig(domain: string, name: string): ServiceConfig | undefined {
    return this.serviceConfigs.get(this.getServiceKey(domain, name));
  }

  /**
   * Get all discovered service configurations
   */
  public getAllServiceConfigs(): ServiceConfig[] {
    return Array.from(this.serviceConfigs.values());
  }

  /**
   * Check if service has database isolation
   */
  public isServiceIsolated(domain: string, name: string): boolean {
    const config = this.getServiceConfig(domain, name);
    return config?.database?.isolation === 'isolated' || false;
  }

  /**
   * Get service auth strategy
   */
  public getServiceAuthStrategy(domain: string, name: string): string {
    const config = this.getServiceConfig(domain, name);
    return config?.auth?.strategy || 'none';
  }

  /**
   * Check if service has tracing enabled
   */
  public isTracingEnabled(domain: string, name: string): boolean {
    const config = this.getServiceConfig(domain, name);
    return config?.tracing?.enabled ?? false;
  }

  /**
   * Get tracing sampling rate (0.0 to 1.0)
   */
  public getTracingSamplingRate(domain: string, name: string): number {
    const config = this.getServiceConfig(domain, name);
    return config?.tracing?.samplingRate ?? 1;
  }

  /**
   * Initialize services (discover, register, run migrations if needed)
   */
  public async initialize(): Promise<void> {
    if (isMicroservicesEnabled() === false) {
      Logger.info('ℹ️  Microservices disabled (MICROSERVICES env var not set)');
      return;
    }

    Logger.info('🚀 Initializing microservices...');

    // Discover and register services
    await this.registerServices();

    // Run migrations if configured
    const services = this.getAllServiceConfigs();
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
   * Generate service key for registry lookup
   */
  private getServiceKey(domain: string, name: string): string {
    return `${domain}/${name}`;
  }
}

/**
 * Microservices configuration helper
 */

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
