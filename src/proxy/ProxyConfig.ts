export type ProxySigningConfig = Readonly<{
  keyId: string;
  secret: string;
  require: boolean;
  windowMs: number;
}>;

export type ProxyServerConfig = Readonly<{
  host: string;
  port: number;
  maxBodyBytes: number;
}>;
