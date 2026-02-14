export type ProxyRequest = Readonly<{
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string;
}>;

export type ProxyResponse = Readonly<{
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}>;

export type ProxyBackend = Readonly<{
  name: string;
  handle: (request: ProxyRequest) => Promise<ProxyResponse>;
  health: () => Promise<ProxyResponse>;
  shutdown?: () => Promise<void>;
}>;
