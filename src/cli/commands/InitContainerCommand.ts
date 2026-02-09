import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { existsSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

export const InitContainerCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:container-workers',
      description: 'Initialize container-based worker infrastructure',
      async execute(): Promise<void> {
        Logger.info('Initializing container-based worker infrastructure...');

        const cwd = process.cwd();

        // 1. Generate docker-compose.workers.yml
        const composeContent = `version: '3.8'

services:
  # BullMQ Workers (Consumer)
  workers:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - RUNTIME_MODE=containers
      - WORKER_ENABLED=true
      - WORKER_AUTO_START=true
      - QUEUE_ENABLED=true
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - DB_CONNECTION=postgres
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_DATABASE=zintrust
      - DB_USERNAME=zintrust
      - DB_PASSWORD=secret
    depends_on:
      - redis
      - postgres
    command: ['node', 'dist/bin/zin.js', 'worker:start-all']
    deploy:
      replicas: 2
      restart_policy:
        condition: any

  # Redis for Queues
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
`;

        const composePath = join(cwd, 'docker-compose.workers.yml');
        if (existsSync(composePath)) {
          Logger.warn('docker-compose.workers.yml already exists, skipping');
        } else {
          writeFileSync(composePath, composeContent);
          Logger.info('✅ Created docker-compose.workers.yml');
        }

        Logger.info('✅ Container worker scaffolding complete.');
        Logger.info('Run with: docker-compose -f docker-compose.workers.yml up');
        await Promise.resolve();
      },
    });
  },
});
