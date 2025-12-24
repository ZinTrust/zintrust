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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Version
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
program.version(packageJson.version);

/**
 * Generate microservices
 */
program
  .command('generate <domain> <services>')
  .description('Generate microservices scaffold')
  .option('--port <port>', 'Base port for services', '3001')
  .option('--version <version>', 'Service version', '1.0.0')
  .action(async (domain: string, services: string, options: any) => {
    try {
      const serviceList = services.split(',').map((s) => s.trim());
      await MicroserviceGenerator.getInstance().generate({
        domain,
        services: serviceList,
        basePort: Number.parseInt(options.port),
        version: options.version,
      });
      console.log('✅ Microservices generated successfully!');
    } catch (error) {
      Logger.error('Error generating microservices:', error);
      console.error('❌ Error:', (error as Error).message);
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
  .action(async (domain: string, services: string, options: Record<string, unknown>) => {
    try {
      const serviceList = services.split(',').map((s) => s.trim());
      const results = await ServiceBundler.getInstance().bundleAll(
        domain,
        serviceList,
        options['output'] as string
      );

      const allOptimized = results.every((r: { optimized: boolean }) => r.optimized === true);
      if (allOptimized === false) {
        console.warn('\n⚠️  Some services exceed target size. Consider optimizing bundle.');
      }
    } catch (error) {
      Logger.error('Error bundling microservices:', error);
      console.error('❌ Error:', (error as Error).message);
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
  .action(async (domain: string, services: string, options: any) => {
    try {
      const serviceList = services.split(',').map((s) => s.trim());

      for (const service of serviceList) {
        await ServiceBundler.getInstance().createServiceImage(service, domain, options.registry);
      }

      console.log(
        `\n✅ Docker images ready. Build with:\n  docker-compose -f services/${domain}/docker-compose.yml build`
      );
    } catch (error) {
      Logger.error('Error creating Docker images:', error);
      console.error('❌ Error:', (error as Error).message);
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
        console.log('No microservices found in services/ folder');
        return;
      }

      console.log(`\n📦 Found ${configs.length} microservice(s):\n`);

      for (const config of configs) {
        const version =
          config.version !== undefined && config.version !== null && config.version !== ''
            ? config.version
            : '1.0.0';
        console.log(`  • ${config.name} (${config.domain}) - v${version}`);
        if (
          config.dependencies !== undefined &&
          config.dependencies !== null &&
          config.dependencies.length > 0
        ) {
          console.log(`    Dependencies: ${config.dependencies.join(', ')}`);
        }
      }

      console.log('');
    } catch (error) {
      Logger.error('Error discovering services:', error);
      console.error('❌ Error:', (error as Error).message);
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

      console.log('\n📊 Microservices Status\n');
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      Logger.error('Error getting microservices status:', error);
      console.error('❌ Error: Microservices not initialized');
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

      console.log('\n🏥 Health Check Results\n');
      for (const [service, healthy] of Object.entries(results)) {
        const status = healthy ? '✅ Healthy' : '❌ Unhealthy';
        console.log(`  ${service}: ${status}`);
      }
    } catch (error) {
      Logger.error('Error performing health check:', error);
      console.error('❌ Error: Microservices not initialized');
      process.exit(1);
    }
  });

program.parse(process.argv);
