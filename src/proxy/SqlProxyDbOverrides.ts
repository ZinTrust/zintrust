export type SqlProxyDatabaseOverrides = Partial<{
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPass: string;
  connectionLimit: number;
}>;

export type SqlProxyDatabaseConfig = Readonly<{
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPass: string;
  connectionLimit: number;
}>;
