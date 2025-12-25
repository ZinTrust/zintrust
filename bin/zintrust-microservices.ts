#!/usr/bin/env node

/**
 * Zintrust Microservices CLI
 * Commands for generating, bundling, and managing microservices
 */

import { Logger } from '@config/logger';
import { MicroserviceGenerator } from '@microservices/MicroserviceGenerator';
import { MicroserviceManager } from '@microservices/MicroserviceManager';
import { ServiceBundler } from '@microservices/ServiceBundler';
import { readFileSync } from '@node-singletons/fs';
import { dirname, join } from '@node-singletons/path';
import { fileURLToPath } from '@node-singletons/url';
import { program } from 'commander';

type CliOptions = Record<string, unknown>;

const getStringOption = (options: CliOptions, key: string, fallback: string): string => {
  const value = options[key];
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Version
const packageJsonUnknown: unknown = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);
const packageVersion =
  typeof packageJsonUnknown === 'object' &&
  packageJsonUnknown !== null &&
  'version' in packageJsonUnknown &&
  typeof (packageJsonUnknown as { version: unknown }).version === 'string'
    ? (packageJsonUnknown as { version: string }).version
    : '0.0.0';

program.version(packageVersion);

/**
 * Generate microservices
 */
program
  .command('generate <domain> <services>')
  .description('Generate microservices scaffold')
  .option('--port <port>', 'Base port for services', '3001')
  .option('--version <version>', 'Service version', '1.0.0')
  .action(async (domain: string, services: string, options: CliOptions) => {
    try {
      const serviceList = services.split(',').map((s) => s.trim());
      const portRaw = getStringOption(options, 'port', '3001');
      const version = getStringOption(options, 'version', '1.0.0');

      await MicroserviceGenerator.getInstance().generate({
        domain,
        services: serviceList,
        basePort: Number.parseInt(portRaw, 10),
        version,
      });

      Logger.info('Microservices generated successfully');
    } catch (error) {
      Logger.error('Error generating microservices:', error);
      process.exit(1);
    }
  });

/**
 * Bundle services
 */
program
  .command('bundle <domain> <services>')
  .description('Bundle microservices for deployment')
  .option('--output <dir>', 'Output directory', 'dist/services')
  .option('--target-size <mb>', 'Target bundle size in MB', '1')
  .action(async (domain: string, services: string, options: CliOptions) => {
    try {
      const serviceList = services.split(',').map((s) => s.trim());
      const outputDir = getStringOption(options, 'output', 'dist/services');

      const results = await ServiceBundler.getInstance().bundleAll(domain, serviceList, outputDir);

      const allOptimized = results.every((r: { optimized: boolean }) => r.optimized === true);
      if (allOptimized === false) {
        Logger.warn('Some services exceed target size. Consider optimizing bundle.');
      }
    } catch (error) {
      Logger.error('Error bundling microservices:', error);
      process.exit(1);
    }
  });

/**
 * Create Docker images
 */
program
  .command('docker <domain> <services>')
  .description('Create Docker images for services')
  .option('--registry <url>', 'Docker registry URL', 'localhost:5000')
  .action(async (domain: string, services: string, options: CliOptions) => {
    try {
      const serviceList = services.split(',').map((s) => s.trim());
      const registry = getStringOption(options, 'registry', 'localhost:5000');

      await Promise.all(
        serviceList.map((service) =>
          ServiceBundler.getInstance().createServiceImage(service, domain, registry)
        )
      );

      Logger.info(
        `Docker images ready. Build with:\n  docker-compose -f services/${domain}/docker-compose.yml build`
      );
    } catch (error) {
      Logger.error('Error creating Docker images:', error);
      process.exit(1);
    }
  });

/**
 * Discover services
 */
program
  .command('discover')
  .description('Discover available microservices')
  .action(async () => {
    try {
      const configs = await MicroserviceManager.discoverServices();

      if (configs.length === 0) {
        Logger.info('No microservices found in services/ folder');
        return;
      }

      Logger.info(`Found ${configs.length} microservice(s):`);

      for (const config of configs) {
        const version =
          config.version !== undefined && config.version !== null && config.version !== ''
            ? config.version
            : '1.0.0';

        Logger.info(`  • ${config.name} (${config.domain}) - v${version}`);

        if (
          config.dependencies !== undefined &&
          config.dependencies !== null &&
          config.dependencies.length > 0
        ) {
          Logger.info(`    Dependencies: ${config.dependencies.join(', ')}`);
        }
      }
    } catch (error) {
      Logger.error('Error discovering services:', error);
      process.exit(1);
    }
  });

/**
 * Status of services
 */
program
  .command('status')
  .description('Check status of running microservices')
  .action(async () => {
    try {
      const manager = MicroserviceManager.getInstance();
      const summary = manager.getStatusSummary();

      Logger.info(`Microservices Status:\n${JSON.stringify(summary, null, 2)}`);
    } catch (error) {
      Logger.error('Error getting microservices status:', error);
      process.exit(1);
    }
  });

/**
 * Health check
 */
program
  .command('health')
  .description('Health check all services')
  .action(async () => {
    try {
      const manager = MicroserviceManager.getInstance();
      const results = await manager.healthCheckAll();

      Logger.info('Health Check Results');
      for (const [service, healthy] of Object.entries(results)) {
        Logger.info(`  ${service}: ${healthy ? 'Healthy' : 'Unhealthy'}`);
      }
    } catch (error) {
      Logger.error('Error performing health check:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
