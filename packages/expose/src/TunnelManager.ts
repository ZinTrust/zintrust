import { CloudflareProvider } from './providers/CloudflareProvider.js';
import type { ITunnelProvider } from './providers/ITunnelProvider.js';
import { ZintrustProvider } from './providers/ZintrustProvider.js';

export function createTunnelProvider(providerName: string): ITunnelProvider {
  switch (providerName.toLowerCase()) {
    case 'cloudflare':
    case 'cf':
      return CloudflareProvider.create();
    case 'zintrust':
    case 'zin':
    default:
      return new ZintrustProvider();
  }
}
