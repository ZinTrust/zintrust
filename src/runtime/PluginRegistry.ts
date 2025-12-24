/**
 * Plugin Registry
 * Defines available plugins, their dependencies, and template paths.
 */

export interface PluginDefinition {
  name: string;
  description: string;
  type: 'database-adapter' | 'feature';
  aliases: string[];
  dependencies: string[];
  devDependencies: string[];
  templates: {
    source: string; // Path relative to src/templates/
    destination: string; // Path relative to project root
  }[];
  postInstall?: {
    message?: string;
    command?: string;
  };
}

export const PluginRegistry: Record<string, PluginDefinition> = {
  'feature:auth': {
    name: 'Authentication Feature',
    description: 'JWT and Bcrypt based authentication helper',
    type: 'feature',
    aliases: ['f:auth', 'auth'],
    dependencies: ['jsonwebtoken', 'bcrypt'],
    devDependencies: ['@types/jsonwebtoken', '@types/bcrypt'],
    templates: [
      {
        source: 'features/Auth.ts.tpl',
        destination: 'src/features/Auth.ts',
      },
    ],
    postInstall: {
      message: 'Authentication installed! Please add JWT_SECRET to your .env file.',
    },
  },
  'feature:queue': {
    name: 'Queue Feature',
    description: 'Simple job queue interface (In-Memory default)',
    type: 'feature',
    aliases: ['f:queue', 'queue'],
    dependencies: [],
    devDependencies: [],
    templates: [
      {
        source: 'features/Queue.ts.tpl',
        destination: 'src/features/Queue.ts',
      },
    ],
  },
  'adapter:postgres': {
    name: 'PostgreSQL Adapter',
    description: 'Production-ready PostgreSQL database adapter using pg',
    type: 'database-adapter',
    aliases: ['a:postgres', 'pg'],
    dependencies: ['pg'],
    devDependencies: ['@types/pg'],
    templates: [
      {
        source: 'adapters/PostgreSQLAdapter.ts.tpl',
        destination: 'src/orm/adapters/PostgreSQLAdapter.ts',
      },
    ],
  },
  'adapter:mysql': {
    name: 'MySQL Adapter',
    description: 'Production-ready MySQL database adapter using mysql2',
    type: 'database-adapter',
    aliases: ['a:mysql', 'mysql'],
    dependencies: ['mysql2'],
    devDependencies: [],
    templates: [
      {
        source: 'adapters/MySQLAdapter.ts.tpl',
        destination: 'src/orm/adapters/MySQLAdapter.ts',
      },
    ],
  },
  'adapter:mssql': {
    name: 'SQL Server Adapter',
    description: 'Production-ready SQL Server database adapter using mssql',
    type: 'database-adapter',
    aliases: ['a:mssql', 'mssql'],
    dependencies: ['mssql'],
    devDependencies: [],
    templates: [
      {
        source: 'adapters/SQLServerAdapter.ts.tpl',
        destination: 'src/orm/adapters/SQLServerAdapter.ts',
      },
    ],
  },
  'adapter:sqlite': {
    name: 'SQLite Adapter',
    description: 'Production-ready SQLite database adapter using better-sqlite3',
    type: 'database-adapter',
    aliases: ['a:sqlite', 'sqlite'],
    dependencies: ['better-sqlite3'],
    devDependencies: ['@types/better-sqlite3'],
    templates: [
      {
        source: 'adapters/SQLiteAdapter.ts.tpl',
        destination: 'src/orm/adapters/SQLiteAdapter.ts',
      },
    ],
  },
};
