/**
 * Db Seed Command
 * Run database seeders from database/seeders
 */

import { SeederDiscovery } from '@/seeders/SeederDiscovery';
import { SeederLoader } from '@/seeders/SeederLoader';
import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { databaseConfig } from '@config/database';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { resetDatabase, useDatabase } from '@orm/Database';
import type { DatabaseConfig as OrmDatabaseConfig } from '@orm/DatabaseAdapter';
import { Command } from 'commander';

type ServiceArgs = { service: string | undefined; includeGlobal: boolean };

const addSeedOptions = (command: Command): void => {
  command
    .option(
      '--dir <path>',
      'Seeders directory (relative to project root)',
      databaseConfig.seeders.directory
    )
    .option('--service <domain/name>', 'Run global + service-local seeders')
    .option('--only-service <domain/name>', 'Run only service-local seeders')
    .option('--no-interactive', 'Skip interactive prompts');
};

const getInteractive = (options: CommandOptions): boolean =>
  options['interactive'] !== false && process.env['CI'] !== 'true';

const ensureNonD1Driver = (driver: string): void => {
  if (driver === 'd1' || driver === 'd1-remote') {
    throw ErrorFactory.createCliError(
      'This project is configured for D1. Seeding via `zin db:seed` is not supported yet.'
    );
  }
};

const mapConnectionToOrmConfig = (
  conn: ReturnType<typeof databaseConfig.getConnection>
): OrmDatabaseConfig => {
  switch (conn.driver) {
    case 'sqlite':
      return { driver: 'sqlite', database: conn.database };
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
    default:
      return { driver: 'sqlite', database: ':memory:' };
  }
};

const confirmProductionRun = async (cmd: IBaseCommand, interactive: boolean): Promise<boolean> => {
  if (Env.NODE_ENV !== 'production') return true;

  const confirmed = await PromptHelper.confirm(
    'NODE_ENV=production. Continue running seeders?',
    false,
    interactive
  );

  if (!confirmed) {
    cmd.warn('Cancelled.');
    return false;
  }

  return true;
};

const getServiceArgs = (options: CommandOptions): ServiceArgs => {
  let serviceArg: string | undefined;

  if (typeof options['onlyService'] === 'string') {
    serviceArg = String(options['onlyService']);
  } else if (typeof options['service'] === 'string') {
    serviceArg = String(options['service']);
  }

  const includeGlobal = typeof options['onlyService'] !== 'string';
  return { service: serviceArg, includeGlobal };
};

const parseServiceRef = (raw: string): { domain: string; name: string } => {
  const trimmed = raw.trim();
  const parts = trimmed.split('/').filter((p) => p.trim().length > 0);
  if (parts.length !== 2) {
    throw ErrorFactory.createCliError(
      `Invalid service reference: '${raw}'. Expected format: <domain>/<name>`
    );
  }
  return { domain: parts[0], name: parts[1] };
};

const normalizeSeederNameArg = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.endsWith('.ts')) return trimmed.slice(0, -3);
  if (trimmed.endsWith('.js')) return trimmed.slice(0, -3);
  return trimmed;
};

const selectSeederFiles = (files: string[], seederName: string | undefined): string[] => {
  if (seederName !== undefined) {
    return files.filter((filePath) => {
      const base = filePath.split('/').pop() ?? '';
      const withoutExt = base.replace(/\.(ts|js)$/u, '');
      return withoutExt === seederName;
    });
  }

  const databaseSeeder = files.find((filePath) => {
    const base = filePath.split('/').pop() ?? '';
    const withoutExt = base.replace(/\.(ts|js)$/u, '');
    return withoutExt === 'DatabaseSeeder';
  });

  if (databaseSeeder !== undefined) return [databaseSeeder];
  return files;
};

const executeSeed = async (options: CommandOptions, cmd: IBaseCommand): Promise<void> => {
  const interactive = getInteractive(options);
  const okToProceed = await confirmProductionRun(cmd, interactive);
  if (!okToProceed) return;

  const conn = databaseConfig.getConnection();
  ensureNonD1Driver(conn.driver);

  const ormConfig = mapConnectionToOrmConfig(conn);
  const db = useDatabase(ormConfig, 'default');

  const dirOpt =
    typeof options['dir'] === 'string' ? options['dir'] : databaseConfig.seeders.directory;

  const { service, includeGlobal } = getServiceArgs(options);
  const projectRoot = process.cwd();

  const globalDir = SeederDiscovery.resolveDir(projectRoot, dirOpt);
  const globalFiles = includeGlobal ? SeederDiscovery.listSeederFiles(globalDir) : [];

  let serviceFiles: string[] = [];
  if (service !== undefined) {
    const { domain, name } = parseServiceRef(service);
    const serviceRoot = `${projectRoot}/services/${domain}/${name}`;
    const serviceDir = SeederDiscovery.resolveDir(serviceRoot, dirOpt);
    serviceFiles = SeederDiscovery.listSeederFiles(serviceDir);
  }

  const seederArgRaw = Array.isArray(options.args) ? options.args[0] : undefined;
  const seederName =
    typeof seederArgRaw === 'string' && seederArgRaw.trim() !== ''
      ? normalizeSeederNameArg(seederArgRaw)
      : undefined;

  const selectedGlobal = selectSeederFiles(globalFiles, seederName);
  const selectedService = selectSeederFiles(serviceFiles, seederName);
  const selected = [...selectedGlobal, ...selectedService];

  if (seederName !== undefined) {
    if (selected.length === 0) {
      throw ErrorFactory.createCliError(
        `Seeder not found: ${seederName} (dir=${dirOpt}, global=${globalFiles.length}, service=${serviceFiles.length})`
      );
    }

    if (selected.length > 1) {
      throw ErrorFactory.createCliError(
        `Seeder name is ambiguous: ${seederName} (matches=${selected.length}). Use --only-service or adjust name.`
      );
    }
  }

  if (selected.length === 0) {
    cmd.info('No seeders found.');
    return;
  }

  cmd.info(`Running ${selected.length} seeder(s)...`);
  await db.connect();

  try {
    await selected.reduce(async (previous, filePath) => {
      await previous;

      const loaded = await SeederLoader.load(filePath);
      cmd.info(`→ ${loaded.name}`);
      await loaded.run(db);
      cmd.success(`✓ Seeded: ${loaded.name}`);
    }, Promise.resolve());
  } finally {
    await resetDatabase();
  }
};

export const DbSeedCommand = Object.freeze({
  create(): IBaseCommand {
    const cmd: IBaseCommand = BaseCommand.create({
      name: 'db:seed',
      description: 'Run database seeders',
      addOptions: addSeedOptions,
      execute: async (options: CommandOptions): Promise<void> => executeSeed(options, cmd),
    });

    return cmd;
  },
});
