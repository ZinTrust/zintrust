export interface TunnelOptions {
  port: number;
  https: boolean;
  subdomain?: string;
  providerOptions?: Record<string, unknown>;
}

export interface ITunnelProvider {
  /**
   * Start the tunnel and return the public URL.
   */
  start(options: TunnelOptions): Promise<string>;

  /**
   * Stop the tunnel.
   */
  stop(): Promise<void>;
}
