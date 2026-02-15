import type { CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { DatabaseConfig as OrmDatabaseConfig } from '@orm/DatabaseAdapter';

export type ConnectionConfig = {
  driver: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
};

export const mapConnectionToOrmConfig = (conn: ConnectionConfig): OrmDatabaseConfig => {
  switch (conn.driver) {
    case 'd1':
      return { driver: 'd1' };
    case 'd1-remote':
      return { driver: 'd1-remote' };
    case 'sqlite':
      return { driver: 'sqlite', database: conn.database ?? ':memory:' };
    case 'postgresql':
      return {
        driver: 'postgresql',
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      };
    case 'mysql':
      return {
        driver: 'mysql',
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      };
    case 'sqlserver':
      return {
        driver: 'sqlserver',
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password: conn.password,
      };
    default:
      throw ErrorFactory.createCliError(
        `Unsupported database driver for ORM migrations: ${String(conn.driver)}`
      );
  }
};

export const parseRollbackSteps = (options: CommandOptions): number => {
  const stepRaw = typeof options['step'] === 'string' ? options['step'] : '1';
  return Math.max(1, Number.parseInt(stepRaw, 10) || 1);
};

export const confirmProductionRun = async (params: {
  cmd: IBaseCommand;
  interactive: boolean;
  message: string;
  destructive?: boolean;
  force?: boolean;
}): Promise<boolean> => {
  if (Env.NODE_ENV !== 'production') return true;
  if (params.force === true) return true;

  const prompt = params.destructive === true ? `${params.message} (destructive)` : params.message;
  const confirmed = await PromptHelper.confirm(prompt, false, params.interactive);

  if (!confirmed) {
    params.cmd.warn('Cancelled.');
    return false;
  }

  return true;
};
