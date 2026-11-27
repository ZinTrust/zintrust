import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  directoryExists: vi.fn((_path: string) => true),
  fileExists: vi.fn((_path: string) => false),
  listFiles: vi.fn((_path: string, _recursive: boolean) => [] as string[]),
  readFile: vi.fn((_path: string) => '{}'),
  writeFile: vi.fn((_path: string, _content: string) => true),
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@cli/scaffolding/FileGenerator', () => ({
  FileGenerator: {
    directoryExists: (...args: unknown[]) => (mocks.directoryExists as (...a: any[]) => any)(...args),
    fileExists: (...args: unknown[]) => (mocks.fileExists as (...a: any[]) => any)(...args),
    listFiles: (...args: unknown[]) => (mocks.listFiles as (...a: any[]) => any)(...args),
    readFile: (...args: unknown[]) => (mocks.readFile as (...a: any[]) => any)(...args),
    writeFile: (...args: unknown[]) => (mocks.writeFile as (...a: any[]) => any)(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import { MigrationGenerator, type MigrationOptions } from '@cli/scaffolding/MigrationGenerator';

const options = (overrides: Partial<MigrationOptions> = {}): MigrationOptions => ({
  name: 'create_users_table',
  migrationsPath: '/project/database/migrations',
  ...overrides,
});

const writtenContent = (): string => String(mocks.writeFile.mock.calls.at(-1)?.[1] ?? '');

describe('MigrationGenerator uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directoryExists.mockReturnValue(true);
    mocks.fileExists.mockReturnValue(false);
    mocks.listFiles.mockReturnValue([]);
    mocks.readFile.mockReturnValue('{}');
    mocks.writeFile.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports an exact timestamp collision', async () => {
    mocks.fileExists.mockImplementation((path: string) =>
      /^\d{14}_create_users_table\.ts$/.test(path.split('/').at(-1) ?? '')
    );

    const result = await MigrationGenerator.generateMigration(options());

    expect(result.success).toBe(false);
    expect(result.message).toContain('Migration file already exists');
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('reports Error and non-Error generation failures', async () => {
    mocks.writeFile.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const fromError = await MigrationGenerator.generateMigration(options());
    expect(fromError.success).toBe(false);
    expect(fromError.message).toContain('disk full');

    mocks.writeFile.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain failure';
    });
    const fromString = await MigrationGenerator.generateMigration(options());
    expect(fromString.success).toBe(false);
    expect(fromString.message).toContain('plain failure');
    expect(mocks.error).toHaveBeenCalledWith('Migration generation error:', expect.anything());
  });

  it('uses framework-local imports for the core package and package imports otherwise', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('package.json'));

    mocks.readFile.mockReturnValue(JSON.stringify({ name: '@zintrust/core' }));
    await MigrationGenerator.generateMigration(options({ table: 'users' }));
    expect(writtenContent()).toContain("from '@orm/Database'");
    expect(writtenContent()).toContain("from '@migrations/schema'");

    mocks.readFile.mockReturnValue(JSON.stringify({ name: 'my-app' }));
    await MigrationGenerator.generateMigration(options({ table: 'users' }));
    expect(writtenContent()).toContain("from '@zintrust/core'");
  });

  it('renders alter migrations with and without a concrete column', async () => {
    await MigrationGenerator.generateMigration(
      options({ name: 'add_status_to_orders', type: 'alter', table: 'orders', column: 'status' })
    );
    expect(writtenContent()).toContain("table.string('status');");
    expect(writtenContent()).toContain('// table.dropColumn(\'old_column\');');

    await MigrationGenerator.generateMigration(
      options({ name: 'add_note_to_orders', type: 'alter', table: 'orders' })
    );
    expect(writtenContent()).toContain("// table.string('new_column');");
    expect(writtenContent()).not.toMatch(/^\s+table\.string\('new_column'\);/m);

    await MigrationGenerator.generateMigration(
      options({ name: 'add_note_to_orders', type: 'alter', table: 'orders', column: '   ' })
    );
    expect(writtenContent()).toContain("// table.string('new_column');");
  });

  it.each([
    ['user_table', 'users'],
    ['status_to_orders_table', 'orders'],
    ['add_email_users_table', 'users'],
    ['add__table', 'adds'],
    ['create_widgets', 'widgets'],
  ])('infers the table name for %s', async (name, expectedTable) => {
    const result = await MigrationGenerator.generateMigration(options({ name, type: 'create' }));
    expect(result.success).toBe(true);
    expect(writtenContent()).toContain(`Creates ${expectedTable} table`);
    expect(writtenContent()).toContain(`schema.create('${expectedTable}'`);
  });
});
