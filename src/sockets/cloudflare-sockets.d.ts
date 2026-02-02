declare module 'cloudflare:sockets' {
  export type Socket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<unknown>;
    closed: Promise<void>;
    startTls: () => Socket;
    close: () => Promise<void>;
  };

  export type ConnectOptions = {
    secureTransport?: 'off' | 'on' | 'starttls';
    allowHalfOpen?: boolean;
  };

  export function connect(
    options: { hostname: string; port: number },
    connectionOptions?: ConnectOptions
  ): Socket;
}
