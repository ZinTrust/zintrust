import { ErrorFactory } from '@zintrust/core/errors';
import { ZedgiRuntime } from './ZedgiRuntime.js';

type ZedgiRedisConfig = {
  password?: string;
  database?: number;
  db?: number;
  header?: Record<string, unknown>;
};

const createZedgiRedisExecutor = () => {
  return async (config: ZedgiRedisConfig, command: string, args: unknown[]): Promise<unknown> => {
    try {
      const redisClient = ZedgiRuntime.redis({
        password: config.password,
        database: config.db ?? config.database,
        header: config.header,
      });
      const result = await redisClient.call(command, ...args);
      return result;
    } catch (error) {
      throw ErrorFactory.createConfigError('[Zedgi Redis Runtime]', error);
    }
  };
};

export { createZedgiRedisExecutor };
