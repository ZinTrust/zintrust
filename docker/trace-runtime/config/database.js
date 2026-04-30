import { Env } from '@zintrust/core';

export default {
  default: 'sqlite',
  connections: {
    sqlite: {
      driver: 'sqlite',
      database: Env.get(
        'DB_DATABASE_SQLITE',
        Env.get('DB_PATH', '.zintrust/dbs/trace-runtime.sqlite'),
      ),
      migrations: 'database/migrations',
    },
  },
};
