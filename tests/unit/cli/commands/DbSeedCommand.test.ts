import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = {
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
};

const loadedSeeder1 = { name: 'UserSeeder', run: vi.fn(async () => undefined) };
const loadedSeeder2 = { name: 'PostSeeder', run: vi.fn(async () => undefined) };

vi.mock('@/config/database', () => ({
  databaseConfig: {
    getConnection: vi.fn(() => ({ driver: 'sqlite', database: ':memory:' })),
    seeders: {
      directory: 'database/seeders',
    },
  },
}));

vi.mock('@/config/env', () => ({
  Env: {
    NODE_ENV: 'test',
  },
}));

vi.mock('@/cli/PromptHelper', () => ({
  PromptHelper: {
    confirm: vi.fn(async () => true),
  },
}));

vi.mock('@/seeders/SeederDiscovery', () => ({
  SeederDiscovery: {
    resolveDir: vi.fn((_projectRoot: string, dir: string) => `/abs/${dir}`),
    listSeederFiles: vi.fn(() => [
      '/abs/database/seeders/UserSeeder.ts',
      '/abs/database/seeders/PostSeeder.js',
    ]),
  },
}));

vi.mock('@/seeders/SeederLoader', () => ({
  SeederLoader: {
    load: vi.fn(async (filePath: string) => {
      if (filePath.includes('UserSeeder')) return { ...loadedSeeder1, filePath };
      return { ...loadedSeeder2, filePath };
    }),
  },
}));

vi.mock('@/orm/Database', () => ({
  useDatabase: vi.fn(() => dbMock),
  resetDatabase: vi.fn(async () => undefined),
}));

import { DbSeedCommand } from '@/cli/commands/DbSeedCommand';
import { PromptHelper } from '@/cli/PromptHelper';
import { databaseConfig } from '@/config/database';
import { Env } from '@/config/env';
import { resetDatabase, useDatabase } from '@/orm/Database';
import { SeederDiscovery } from '@/seeders/SeederDiscovery';
import { SeederLoader } from '@/seeders/SeederLoader';

describe('DbSeedCommand', () => {
  let command: any;

  beforeEach(() => {
    vi.clearAllMocks();
    (Env as any).NODE_ENV = 'test';
    loadedSeeder1.run.mockResolvedValue(undefined);
    loadedSeeder2.run.mockResolvedValue(undefined);

    command = DbSeedCommand.create();
    command.info = vi.fn();
    command.warn = vi.fn();
    command.success = vi.fn();
  });

  it('creates command and exposes commander metadata', () => {
    expect(command).toBeDefined();
    const cmd = command.getCommand();
    expect(cmd.name()).toBe('db:seed');
    expect(cmd.description().length).toBeGreaterThan(0);
  });

  it('registers expected options', () => {
    const helpText = command.getCommand().helpInformation();
    expect(helpText).toContain('--dir');
    expect(helpText).toContain('--no-interactive');
    expect(helpText).toContain('--verbose');
  });

  it('runs all seeders by default', async () => {
    await command.execute({});

    expect(databaseConfig.getConnection).toHaveBeenCalled();
    expect(useDatabase).toHaveBeenCalled();
    expect(dbMock.connect).toHaveBeenCalled();
    expect(SeederDiscovery.listSeederFiles).toHaveBeenCalled();
    expect(SeederLoader.load).toHaveBeenCalledTimes(2);
    expect(loadedSeeder1.run).toHaveBeenCalledTimes(1);
    expect(loadedSeeder2.run).toHaveBeenCalledTimes(1);
    expect(resetDatabase).toHaveBeenCalled();
  });

  it('runs DatabaseSeeder only when present', async () => {
    vi.mocked(SeederDiscovery.listSeederFiles).mockReturnValueOnce([
      '/abs/database/seeders/DatabaseSeeder.ts',
      '/abs/database/seeders/UserSeeder.ts',
    ]);

    await command.execute({});

    expect(SeederLoader.load).toHaveBeenCalledTimes(1);
    expect(SeederLoader.load).toHaveBeenCalledWith('/abs/database/seeders/DatabaseSeeder.ts');
  });

  it('runs a single seeder when a name argument is provided', async () => {
    await command.execute({ args: ['UserSeeder'] });

    expect(SeederLoader.load).toHaveBeenCalledTimes(1);
    expect(loadedSeeder1.run).toHaveBeenCalledTimes(1);
    expect(loadedSeeder2.run).not.toHaveBeenCalled();
  });

  it('runs only service-local seeders when --only-service is provided', async () => {
    vi.mocked(SeederDiscovery.resolveDir).mockImplementation((root: string, dir: string) => {
      if (root.includes('/services/')) return `${root}/${dir}`;
      return `${root}/${dir}`;
    });
    // With --only-service, we do not list global seeders, so the first call is service-local.
    vi.mocked(SeederDiscovery.listSeederFiles).mockReturnValueOnce([
      '/abs/services/demo/users/database/seeders/UserSeeder.ts',
    ]);

    await command.execute({ onlyService: 'demo/users' });

    // includeGlobal=false for only-service
    expect(SeederLoader.load).toHaveBeenCalledTimes(1);
    expect(SeederLoader.load).toHaveBeenCalledWith(
      expect.stringContaining('/services/demo/users/database/seeders/UserSeeder.ts')
    );
  });

  it('runs global + service-local seeders when --service is provided', async () => {
    vi.mocked(SeederDiscovery.resolveDir).mockImplementation((root: string, dir: string) => {
      if (root.includes('/services/')) return `${root}/${dir}`;
      return `${root}/${dir}`;
    });
    vi.mocked(SeederDiscovery.listSeederFiles)
      .mockReturnValueOnce(['/abs/database/seeders/UserSeeder.ts'])
      .mockReturnValueOnce(['/abs/services/demo/users/database/seeders/PostSeeder.ts']);

    await command.execute({ service: 'demo/users' });

    expect(SeederLoader.load).toHaveBeenCalledTimes(2);
  });

  it('does not run in production when not confirmed', async () => {
    (Env as any).NODE_ENV = 'production';
    vi.mocked(PromptHelper.confirm).mockResolvedValueOnce(false);

    await command.execute({});

    expect(dbMock.connect).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
  });

  it('throws a CLI error for D1 configs', async () => {
    vi.mocked(databaseConfig.getConnection).mockReturnValueOnce({ driver: 'd1' } as any);

    await expect(command.execute({})).rejects.toBeDefined();
    expect(dbMock.connect).not.toHaveBeenCalled();
  });
});
