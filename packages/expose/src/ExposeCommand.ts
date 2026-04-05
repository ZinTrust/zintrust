/* eslint-disable no-console */
import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { createTunnelProvider } from './TunnelManager.js';

// Since this CLI runs early, we parse .env for the default PORT if unspecified
dotenv.config({ path: resolve(process.cwd(), '.env') });

const createExposeCommand = (): Command => {
  const command = new Command('expose')
    .alias('exp')
    .description('Expose your local ZinTrust server to the internet using secure tunnels.')
    .argument('[port]', 'The local port to expose', process.env['PORT'] || '3000')
    .option('--https', 'Connect locally via HTTPS instead of HTTP', false)
    .option('--provider <provider>', 'Tunnel provider (zintrust | cloudflare)', 'cloudflare')
    .action(async (portArg, options) => {
      const port = Number.parseInt(portArg, 10);
      if (Number.isNaN(port)) {
        console.error(`Invalid port provided: ${portArg}`);
        process.exit(1);
      }

      console.log(`Starting URL exposure on port ${port} using ${options.provider} provider...`);

      const provider = createTunnelProvider(options.provider);

      try {
        const publicUrl = await provider.start({ port, https: options.https });

        console.log(`\n=============================================================`);
        console.log(`🚀 Tunnel Established successfully!`);
        console.log(`🌍 Public URL     : \x1b[32m${publicUrl}\x1b[0m`);
        console.log(`🔌 Local Target   : ${options.https ? 'https' : 'http'}://localhost:${port}`);
        console.log(`🛡️  Provider      : ${options.provider}`);
        console.log(`=============================================================\n`);
        console.log(`Press Ctrl+C to disconnect from the tunnel.\n`);

        process.on('SIGINT', async () => {
          console.log(`\nDisconnecting ${options.provider} tunnel...`);
          await provider.stop();
          process.exit(0);
        });
      } catch (error: unknown) {
        console.error(`Tunnel failed to start:`, (error as Error).message);
        process.exit(1);
      }
    });

  return command;
};

export const ExposeCommand = Object.freeze({
  getCommand: createExposeCommand,
  name: 'expose',
});
