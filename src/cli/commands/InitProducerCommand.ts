import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const InitProducerCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:producer',
      description: 'Configure Cloudflare Workers as producer-only',
      async execute(): Promise<void> {
        Logger.info('Configuring Cloudflare Workers project as Producer-only...');

        const cwd = process.cwd();
        const wranglerPath = join(cwd, 'wrangler.jsonc');

        if (!existsSync(wranglerPath)) {
          Logger.error('wrangler.jsonc not found. Is this a Cloudflare Workers project?');
          return;
        }

        let content = readFileSync(wranglerPath, 'utf-8');
        let modified = false;

        // Force WORKER_ENABLED = false
        if (content.includes('"WORKER_ENABLED"')) {
          content = content.replace(/"WORKER_ENABLED"\s*:\s*"true"/, '"WORKER_ENABLED": "false"');
          content = content.replace(/"WORKER_ENABLED"\s*:\s*true/, '"WORKER_ENABLED": "false"');
          modified = true;
        } else {
          // Inject into vars
          const varsMatch = content.match(/"vars"\s*:\s*{/);
          if (varsMatch) {
            content = content.replace(
              /"vars"\s*:\s*{/,
              `"vars": {\n    "WORKER_ENABLED": "false",\n    "QUEUE_ENABLED": "true",\n    "RUNTIME_MODE": "cloudflare-workers",`
            );
            modified = true;
          }
        }

        if (modified) {
          writeFileSync(wranglerPath, content);
          Logger.success('Updated wrangler.jsonc: Set WORKER_ENABLED=false, QUEUE_ENABLED=true');
        } else {
          Logger.info(
            'wrangler.jsonc configuration appears correct or could not be automatically patched.'
          );
        }

        Logger.info('✅ Producer configuration check complete.');
      },
    });
  },
});
