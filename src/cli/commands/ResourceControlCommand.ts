/**
 * Resource Control Command
 * Control the resource monitor (start/stop) on the running worker service via HTTP
 */

import { ErrorFactory } from '@/exceptions/ZintrustError';
import { BaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';

export const ResourceControlCommand = BaseCommand.create({
  name: 'resource:monitor',
  description: 'Control the resource monitor (start/stop) on the running worker service',
  aliases: ['rm'],
  addOptions: (cmd) => {
    cmd.argument('<action>', 'Action to perform: start or stop');
    cmd.option('--port <port>', 'Worker service port', '7777');
    cmd.option('--host <host>', 'Worker service host', '127.0.0.1');
  },
  execute: async (options) => {
    const action = options.args?.[0];
    const port = options['port'] ?? '7777';
    const host = options['host'] ?? '127.0.0.1';

    if (action === undefined || !['start', 'stop'].includes(action)) {
      Logger.error('Invalid action. Use "start" or "stop".');
      return;
    }

    const url = `http://${host}:${port}/api/resources/${action}`;

    try {
      Logger.info(`Sending ${action} request to ${url}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw ErrorFactory.createCliError(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as { message: string };
      Logger.info(`Success: ${data.message}`);
    } catch (e) {
      Logger.error(`Failed to ${action} resource monitor: ${(e as Error).message}`);
      Logger.info('Ensure the worker service is running and the port is correct.');
    }
  },
});
