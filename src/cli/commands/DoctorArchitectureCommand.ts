import type { RuntimeMode } from '@/runtime/detectRuntime';
import { getRuntimeMode } from '@/runtime/detectRuntime';
import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { Env } from '@config/env';
import { Logger } from '@config/logger';

export const DoctorArchitectureCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'doctor:architecture',
      description: 'Validate producer/consumer architecture configuration',
      async execute(): Promise<void> {
        Logger.info('🩺 Diagnosing Architecture Configuration...');

        const mode: RuntimeMode = getRuntimeMode() as RuntimeMode;
        const workerEnabled = Env.getBool('WORKER_ENABLED', true);
        const queueEnabled = Env.getBool('QUEUE_ENABLED', true);

        Logger.info('----------------------------------------');
        Logger.info(`Runtime Mode:    ${mode}`);
        Logger.info(`Worker Enabled:  ${workerEnabled}`);
        Logger.info(`Queue Enabled:   ${queueEnabled}`);
        Logger.info('----------------------------------------');

        const issues: string[] = [];

        // Rule 1: Cloudflare Workers cannot run Consumers
        if (mode === 'cloudflare-workers' && workerEnabled) {
          issues.push(
            '❌ CRITICAL: Cloudflare Workers runtime detected but WORKER_ENABLED=true. Consumers will fail due to connection persistence limits. Set WORKER_ENABLED=false.'
          );
        }

        // Rule 2: Containers should generally run Workers (unless dedicated to API)
        if (mode === 'containers' && !workerEnabled) {
          issues.push(
            '⚠️ WARNING: Container runtime detected but WORKER_ENABLED=false. Are these containers for API only? If attempting to process jobs, enable workers.'
          );
        }

        // Rule 3: Proxy requirement for Cloudflare
        if (mode === 'cloudflare-workers') {
          const useProxy =
            Env.getBool('USE_REDIS_PROXY', false) ||
            Env.getBool('ENABLE_CLOUDFLARE_SOCKETS', false);
          if (!useProxy) {
            issues.push(
              '❌ CRITICAL: Cloudflare runtime requires USE_REDIS_PROXY=true or ENABLE_CLOUDFLARE_SOCKETS=true for Queue producers.'
            );
          }
        }

        if (issues.length > 0) {
          Logger.error('Found configuration issues:');
          issues.forEach((issue) => Logger.error(issue));
          process.exit(1);
        } else {
          Logger.info('✅ Architecture configuration looks valid for this runtime.');
        }
        await Promise.resolve();
      },
    });
  },
});
