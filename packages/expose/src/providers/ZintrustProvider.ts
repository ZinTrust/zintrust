/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
import type { ITunnelProvider, TunnelOptions } from './ITunnelProvider.js';

export class ZintrustProvider implements ITunnelProvider {
  async start(_options: TunnelOptions): Promise<string> {
    // In the future, this will connect to the official ZinTrust tunneled infrastructure
    // via WebSockets or a similar reverse proxy technique.
    // For now, we stub this out or fallback to localhost.
    console.warn('ZinTrust provider is coming soon in the expose package.');
    console.warn('Please use `--provider cloudflare` instead for now.');
    throw new Error('ZinTrust Tunnel Provider not implemented yet');
  }

  async stop(): Promise<void> {
    // Clean up WS connections or sockets
  }
}
