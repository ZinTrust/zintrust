type AnyFn = (...a: any[]) => any;
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const success = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  message: 'ok',
  filesCreated: [],
  filePath: '/project/generated.ts',
  servicePath: '/project/src/services/default/users',
  controllerFile: '/project/app/Controllers/UsersController.ts',
  routeFile: '/project/routes/api.ts',
  modelFile: '/project/app/Models/User.ts',
  factoryPath: '/project/database/factories/UserFactory.ts',
  requestPath: '/project/app/Requests/CreateUserRequest.ts',
  responsePath: '/project/app/Responses/UserResponse.ts',
  ...overrides,
});

const mocks = vi.hoisted(() => ({
  scaffoldService: vi.fn(async () => success()),
  addFeature: vi.fn(() => success()),
  getAvailableFeatures: vi.fn(() => ['auth']),
  generateMigration: vi.fn(async () => success()),
  generateModel: vi.fn(async () => success()),
  generateController: vi.fn(async () => success()),
  generateRoutes: vi.fn(() => success()),
  generateFactory: vi.fn(async () => success()),
  generateSeeder: vi.fn(async () => success()),
  generateDatabaseSeeder: vi.fn(async () => success()),
  generateRequestFactory: vi.fn(async () => success()),
  generateResponseFactory: vi.fn(async () => success()),
  generateWorkflow: vi.fn(async () => success()),
  scaffoldGovernance: vi.fn(async () => success()),
  listFiles: vi.fn(() => [] as string[]),
  fileExists: vi.fn((_path: string) => false),
  readFile: vi.fn((_path: string) => ''),
  writeFile: vi.fn((_path: string, _content: string, _opts?: unknown) => true),
  existsSync: vi.fn((_path: string) => false),
  mkdirSync: vi.fn(),
  fsWriteFileSync: vi.fn(),
  prompt: vi.fn(async () => ({}) as Record<string, unknown>),
  install: vi.fn(async () => undefined),
  toSnakeCase: vi.fn((value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  ),
  camelCase: vi.fn((value: string) => value.charAt(0).toLowerCase() + value.slice(1)),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@cli/scaffolding/ServiceScaffolder', () => ({
  ServiceScaffolder: { scaffold: (...args: unknown[]) => (mocks.scaffoldService as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/FeatureScaffolder', () => ({
  FeatureScaffolder: {
    addFeature: (...args: unknown[]) => (mocks.addFeature as AnyFn)(...args),
    getAvailableFeatures: () => mocks.getAvailableFeatures(),
  },
}));
vi.mock('@cli/scaffolding/MigrationGenerator', () => ({
  MigrationGenerator: { generateMigration: (...args: unknown[]) => (mocks.generateMigration as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/ModelGenerator', () => ({
  ModelGenerator: { generateModel: (...args: unknown[]) => (mocks.generateModel as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/ControllerGenerator', () => ({
  ControllerGenerator: { generateController: (...args: unknown[]) => (mocks.generateController as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/RouteGenerator', () => ({
  RouteGenerator: { generateRoutes: (...args: unknown[]) => (mocks.generateRoutes as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/FileGenerator', () => ({
  FileGenerator: {
    listFiles: (...args: unknown[]) => (mocks.listFiles as AnyFn)(...args),
    fileExists: (...args: unknown[]) => (mocks.fileExists as AnyFn)(...args),
    readFile: (...args: unknown[]) => (mocks.readFile as AnyFn)(...args),
    writeFile: (...args: unknown[]) => (mocks.writeFile as AnyFn)(...args),
  },
}));
vi.mock('@cli/scaffolding/GovernanceScaffolder', () => ({
  GovernanceScaffolder: { scaffold: (...args: unknown[]) => (mocks.scaffoldGovernance as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/FactoryGenerator', () => ({
  FactoryGenerator: { generateFactory: (...args: unknown[]) => (mocks.generateFactory as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/SeederGenerator', () => ({
  SeederGenerator: {
    generateSeeder: (...args: unknown[]) => (mocks.generateSeeder as AnyFn)(...args),
    generateDatabaseSeeder: (...args: unknown[]) => (mocks.generateDatabaseSeeder as AnyFn)(...args),
  },
}));
vi.mock('@cli/scaffolding/RequestFactoryGenerator', () => ({
  RequestFactoryGenerator: {
    generateRequestFactory: (...args: unknown[]) => (mocks.generateRequestFactory as AnyFn)(...args),
  },
}));
vi.mock('@cli/scaffolding/ResponseFactoryGenerator', () => ({
  ResponseFactoryGenerator: { generate: (...args: unknown[]) => (mocks.generateResponseFactory as AnyFn)(...args) },
}));
vi.mock('@cli/scaffolding/WorkflowGenerator', () => ({
  WorkflowGenerator: { generate: (...args: unknown[]) => (mocks.generateWorkflow as AnyFn)(...args) },
}));
vi.mock('@runtime/PluginManager', () => ({
  PluginManager: { install: (...args: unknown[]) => (mocks.install as AnyFn)(...args) },
}));
vi.mock('@common/index', () => ({
  CommonUtils: {
    toSnakeCase: (...args: unknown[]) => (mocks.toSnakeCase as AnyFn)(...args),
    camelCase: (...args: unknown[]) => (mocks.camelCase as AnyFn)(...args),
  },
}));
vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as AnyFn)(...args),
  mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
  writeFileSync: (...args: unknown[]) => mocks.fsWriteFileSync(...args),
  default: {
    existsSync: (...args: unknown[]) => (mocks.existsSync as AnyFn)(...args),
    mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
    writeFileSync: (...args: unknown[]) => mocks.fsWriteFileSync(...args),
  },
}));
vi.mock('inquirer', () => ({
  default: { prompt: (...args: unknown[]) => (mocks.prompt as AnyFn)(...args) },
}));
vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

import { AddCommand } from '@cli/commands/AddCommand';

type Question = { validate?: (value: string) => string | boolean };

const helpers = () =>
  (AddCommand as unknown as { _helpers: Record<string, (...args: never[]) => unknown> })._helpers;

const question = (value: unknown, index = 0): Question =>
  (value as Question[])[index] ?? {};

describe('AddCommand uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scaffoldService.mockImplementation(async () => success());
    mocks.addFeature.mockImplementation(() => success());
    mocks.generateMigration.mockImplementation(async () => success());
    mocks.generateModel.mockImplementation(async () => success());
    mocks.generateController.mockImplementation(async () => success());
    mocks.generateRoutes.mockImplementation(() => success());
    mocks.generateFactory.mockImplementation(async () => success());
    mocks.generateSeeder.mockImplementation(async () => success());
    mocks.generateDatabaseSeeder.mockImplementation(async () => success());
    mocks.generateRequestFactory.mockImplementation(async () => success());
    mocks.generateResponseFactory.mockImplementation(async () => success());
    mocks.generateWorkflow.mockImplementation(async () => success());
    mocks.scaffoldGovernance.mockImplementation(async () => success());
    mocks.listFiles.mockReturnValue([]);
    mocks.fileExists.mockReturnValue(false);
    mocks.readFile.mockReturnValue('');
    mocks.writeFile.mockReturnValue(true);
    mocks.existsSync.mockReturnValue(false);
    mocks.install.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty and malformed prompt values', () => {
    const h = helpers();
    let questions: Question[] = [];
    mocks.prompt.mockImplementationOnce(async (value: unknown) => {
      questions = value as Question[];
      return {};
    });
    h['promptServiceConfig']('');
    expect(question(questions).validate?.('')).toBe('Must be lowercase letters only');

    mocks.prompt.mockImplementationOnce(async (value: unknown) => {
      questions = value as Question[];
      return {};
    });
    h['promptMigrationConfig']();
    expect(question(questions).validate?.('')).toBe('Must be snake_case');
    const isPascalCaseBase = h['isPascalCaseBase'] as (value: string) => boolean;
    expect(isPascalCaseBase('')).toBe(false);
    expect(isPascalCaseBase('user')).toBe(false);
    expect(isPascalCaseBase('User-Name')).toBe(false);
    expect(isPascalCaseBase('User1')).toBe(true);
  });

  it('returns undefined when a route block has no label or brace', () => {
    const findRouteBlockBounds = helpers()['findRouteBlockBounds'] as (
      source: string
    ) => unknown;
    expect(findRouteBlockBounds('const config = {};')).toBeUndefined();
    expect(findRouteBlockBounds('route: no brace here')).toBeUndefined();
    expect(findRouteBlockBounds('route: {')).toBeUndefined();
    expect(findRouteBlockBounds('route: { other: Other, },')).toBeDefined();
  });

  it('pluralizes only when needed and rejects non-matching migration files', async () => {
    mocks.listFiles.mockReturnValue([
      '/project/database/migrations/20240101000000_create_users_table.ts',
    ]);

    await AddCommand.create().execute({
      args: ['migration', 'email', 'Users'],
      noInteractive: true,
    } as never);

    expect(mocks.generateMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'add_email_users_table',
        table: 'users',
        column: 'email',
      })
    );

    mocks.listFiles.mockReturnValue(['/project/database/migrations/20240101000000_other.ts']);
    await expect(
      AddCommand.create().execute({
        args: ['migration', 'email', 'User'],
        noInteractive: true,
      } as never)
    ).rejects.toThrow(/Missing required create migration/);
  });

  it.each([
    ['', ''],
    ['', 'User'],
    ['email', ''],
  ])('rejects incomplete shorthand migrations (%s, %s)', async (column, model) => {
    const interactive = column === '';
    if (interactive) {
      mocks.prompt.mockResolvedValueOnce({ name: 'ignored', type: 'create' });
    }
    await expect(
      AddCommand.create().execute({
        args: ['migration', column, model],
        noInteractive: !interactive,
      } as never)
    ).rejects.toThrow(/Usage: zin add migration/);
  });

  it('uses empty fallbacks for undefined shorthand arguments', async () => {
    mocks.prompt.mockResolvedValueOnce({ name: 'ignored', type: 'create' });
    await expect(
      AddCommand.create().execute({
        args: ['migration', undefined, undefined],
      } as never)
    ).rejects.toThrow(/Usage: zin add migration/);
  });

  const middlewareConfig = async (content: string, options: Record<string, unknown> = {}) => {
    mocks.fileExists.mockImplementation((path: string) => String(path).endsWith('middleware.ts'));
    mocks.readFile.mockReturnValue(content);
    await AddCommand.create().execute({
      args: ['middleware', 'AuthMiddleware'],
      noInteractive: true,
      ...options,
    } as never);
  };

  it('does not duplicate an existing middleware import', async () => {
    await middlewareConfig(
      "import { AuthMiddleware } from '@app/Middleware/AuthMiddleware';\nroute: { other: Other, },"
    );
    expect(mocks.fsWriteFileSync).toHaveBeenCalled();
  });

  it('prepends an import when the config has no imports', async () => {
    await middlewareConfig('const config = {};\nroute: { other: Other, },');
    expect(mocks.readFile).toHaveBeenCalled();
    expect(mocks.fsWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('middleware.ts'),
      expect.stringContaining("import { AuthMiddleware }"),
      'utf-8'
    );
  });

  it('skips route registration when the key already exists', async () => {
    await middlewareConfig(
      "import { AuthMiddleware } from '@app/Middleware/AuthMiddleware';\nroute: { authMiddleware: AuthMiddleware, },"
    );
    expect(mocks.fsWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('middleware.ts'),
      expect.stringContaining('authMiddleware: AuthMiddleware'),
      'utf-8'
    );
  });

  it('appends to a non-empty route block and to a trailing MiddlewaresType cast', async () => {
    await middlewareConfig(
      'import type { Middleware } from \'@zintrust/core\';\nroute: { existing: Existing, },'
    );
    expect(mocks.fsWriteFileSync.mock.calls.at(-1)?.[1]).toContain('authMiddleware: AuthMiddleware');

    await middlewareConfig('import x from \'x\';\nconst config = {\n} as MiddlewaresType;');
    expect(mocks.fsWriteFileSync.mock.calls.at(-1)?.[1]).toContain('"global": []'.replace(/"/g, ''));
    expect(mocks.fsWriteFileSync.mock.calls.at(-1)?.[1]).toContain('authMiddleware: AuthMiddleware');
  });

  it('prints manual instructions when automatic registration is impossible', async () => {
    await middlewareConfig('import x from \'x\';\nconst config = { };');
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not update config/middleware.ts automatically')
    );
    expect(mocks.fsWriteFileSync).not.toHaveBeenCalled();
  });

  it('prompts for a missing middleware name and validates explicit names', async () => {
    mocks.prompt.mockResolvedValueOnce({ name: 'AuthMiddleware' });
    mocks.fileExists.mockReturnValue(false);
    await AddCommand.create().execute({ args: ['middleware'] } as never);
    expect(mocks.prompt).toHaveBeenCalled();

    await expect(
      AddCommand.create().execute({ args: ['middleware'], noInteractive: true } as never)
    ).rejects.toThrow(/Middleware name is required/);

    await expect(
      AddCommand.create().execute({ args: ['middleware', 'Invalid'], noInteractive: true } as never)
    ).rejects.toThrow(/PascalCase ending with "Middleware"/);
  });

  it('reports an updated middleware when the file already existed', async () => {
    mocks.fileExists.mockImplementation((path: string) => String(path).endsWith('middleware.ts'));
    mocks.readFile.mockReturnValue('route: { authMiddleware: AuthMiddleware, },');
    mocks.writeFile.mockReturnValue(false);
    await AddCommand.create().execute({
      args: ['middleware', 'AuthMiddleware'],
      noInteractive: true,
    } as never);
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('updated successfully'));
  });

  it('falls back to a generic factory label when no file path is returned', async () => {
    mocks.generateFactory.mockImplementation(async () => success({ filePath: undefined }));
    await AddCommand.create().execute({
      args: ['factory', 'UserFactory'],
      model: 'User',
      noInteractive: true,
    } as never);
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('File: factory'));
  });

  it('defaults relationships when the interactive answers omit them', async () => {
    mocks.prompt.mockResolvedValueOnce({
      name: 'UserFactory',
      model: 'User',
      addRelationships: false,
    });
    await AddCommand.create().execute({ args: ['factory'] } as never);
    expect(mocks.generateFactory).toHaveBeenCalledWith(
      expect.objectContaining({ relationships: undefined })
    );
  });

  it('handles DatabaseSeeder success and failure results', async () => {
    await AddCommand.create().execute({
      args: ['seeder', 'DatabaseSeeder'],
      noInteractive: true,
    } as never);
    expect(mocks.generateDatabaseSeeder).toHaveBeenCalled();

    mocks.generateDatabaseSeeder.mockImplementation(async () =>
      success({ success: false, message: 'seeder failure' })
    );
    await expect(
      AddCommand.create().execute({
        args: ['seeder', 'DatabaseSeeder'],
        noInteractive: true,
      } as never)
    ).rejects.toThrow(/seeder failure/);

    mocks.generateDatabaseSeeder.mockImplementation(async () =>
      success({ success: false, message: undefined })
    );
    await expect(
      AddCommand.create().execute({
        args: ['seeder', 'DatabaseSeeder'],
        noInteractive: true,
      } as never)
    ).rejects.toThrow();
  });

  it('uses defaults for blank request factory answers and skips the DTO path', async () => {
    mocks.prompt.mockResolvedValueOnce({
      factoryName: 'CreateUserRequestFactory',
      requestName: '',
      endpoint: '',
      method: '',
      withDTO: false,
    });
    await AddCommand.create().execute({ args: ['requestfactory'] } as never);
    expect(mocks.generateRequestFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        requestName: 'CreateUserRequest',
        endpoint: '/api/v1/resource',
        method: 'POST',
        requestsPath: undefined,
      })
    );
  });

  it('reports a defined response factory path and skips DTO generation when disabled', async () => {
    mocks.generateResponseFactory.mockImplementation(async () =>
      success({ responsePath: undefined })
    );
    await AddCommand.create().execute({
      args: ['responsefactory', 'UserResponseFactory'],
      noInteractive: true,
    } as never);
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('Factory: UserFactory.ts'));

    mocks.generateResponseFactory.mockImplementation(async () =>
      success({ factoryPath: undefined })
    );
    await AddCommand.create().execute({
      args: ['responsefactory', 'UserResponseFactory'],
      noInteractive: true,
    } as never);
    expect(
      mocks.info.mock.calls
        .map((call) => String(call[0]))
        .some((message) => message.includes('Factory: ') && !message.includes('UserFactory'))
    ).toBe(true);

    mocks.prompt.mockResolvedValueOnce({
      factoryName: 'UserResponseFactory',
      responseName: 'UserResponse',
      responseType: 'custom',
      withDTO: false,
    });
    await AddCommand.create().execute({ args: ['responsefactory', 'UserResponseFactory'] } as never);
    expect(mocks.generateResponseFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ fields: [], responsesPath: undefined })
    );
  });

  it('reports governance failures with and without a message', async () => {
    mocks.scaffoldGovernance.mockImplementation(async () =>
      success({ success: false, message: undefined })
    );
    await expect(
      AddCommand.create().execute({ args: ['governance'] } as never)
    ).rejects.toThrow(/Governance installation failed/);

    mocks.scaffoldGovernance.mockImplementation(async () =>
      success({ success: false, message: 'eslint missing' })
    );
    await expect(
      AddCommand.create().execute({ args: ['governance'] } as never)
    ).rejects.toThrow(/eslint missing/);
  });

  it('installs plugin ids without a name argument', async () => {
    await AddCommand.create().execute({ args: ['db:sqlite'] } as never);
    expect(mocks.install).toHaveBeenCalledWith('db:sqlite');

    await AddCommand.create().execute({
      args: ['db:sqlite'],
      packageManager: 'pnpm',
    } as never);
    expect(mocks.install).toHaveBeenLastCalledWith('db:sqlite', { packageManager: 'pnpm' });
  });

  it('reads positional args from the command when options.args is absent', async () => {
    const cmd = AddCommand.create();
    vi.spyOn(cmd, 'getCommand').mockReturnValue({
      args: ['service', 'users'],
      opts: () => ({ noInteractive: true }),
    } as never);
    await cmd.execute({} as never);
    expect(mocks.scaffoldService).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'users' })
    );

    const empty = AddCommand.create();
    vi.spyOn(empty, 'getCommand').mockReturnValue({
      args: undefined,
      opts: () => ({}),
    } as never);
    await expect(empty.execute({} as never)).rejects.toThrow(/Please specify what to add/);

    const withoutOpts = AddCommand.create();
    vi.spyOn(withoutOpts, 'getCommand').mockReturnValue({
      args: ['service', 'users'],
    } as never);
    await withoutOpts.execute({ noInteractive: true } as never);
    expect(mocks.scaffoldService).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'users' })
    );
  });
});
