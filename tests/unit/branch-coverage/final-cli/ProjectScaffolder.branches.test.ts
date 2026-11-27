import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((_path: string) => false),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  readdirSync: vi.fn((_path: string) => [] as unknown[]),
  readFileSync: vi.fn((_path: string) => ''),
  writeFileSync: vi.fn(),
  execFileSync: vi.fn((_command: string, _args: string[], _opts: unknown) => '"1.2.3"'),
  randomBytes: vi.fn((_size: number) => Buffer.alloc(32, 1)),
  envData: vi.fn((..._args: unknown[]) => ['APP_KEY=base64:test', 'PORT=7777']),
  backfill: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as (...a: any[]) => any)(...args),
  mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
  rmSync: (...args: unknown[]) => mocks.rmSync(...args),
  statSync: (...args: unknown[]) => (mocks.statSync as (...a: any[]) => any)(...args),
  readdirSync: (...args: unknown[]) => (mocks.readdirSync as (...a: any[]) => any)(...args),
  readFileSync: (...args: unknown[]) => (mocks.readFileSync as (...a: any[]) => any)(...args),
  writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
  default: {
    existsSync: (...args: unknown[]) => (mocks.existsSync as (...a: any[]) => any)(...args),
    mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
    rmSync: (...args: unknown[]) => mocks.rmSync(...args),
    statSync: (...args: unknown[]) => (mocks.statSync as (...a: any[]) => any)(...args),
    readdirSync: (...args: unknown[]) => (mocks.readdirSync as (...a: any[]) => any)(...args),
    readFileSync: (...args: unknown[]) => (mocks.readFileSync as (...a: any[]) => any)(...args),
    writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
  },
}));

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => (mocks.execFileSync as (...a: any[]) => any)(...args),
}));

vi.mock('@node-singletons/crypto', () => ({
  randomBytes: (...args: unknown[]) => (mocks.randomBytes as (...a: any[]) => any)(...args),
}));

vi.mock('@cli/scaffolding/env', () => ({
  EnvData: (...args: unknown[]) => mocks.envData(...args),
}));

vi.mock('@cli/env/EnvFileBackfill', () => ({
  EnvFileBackfill: { backfillEnvDefaults: (...args: unknown[]) => mocks.backfill(...args) },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

vi.mock('@helper/index', () => ({
  isNonEmptyString: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
}));

type ScaffolderModule = typeof import('@cli/scaffolding/ProjectScaffolder');

const dirent = (name: string, kind: 'file' | 'dir' | 'other') => ({
  name,
  isDirectory: () => kind === 'dir',
  isFile: () => kind === 'file',
});

const templateMeta = (meta: Record<string, unknown>): string => JSON.stringify(meta);

const withTemplate = (meta: Record<string, unknown> = { name: 'basic' }): void => {
  mocks.existsSync.mockImplementation((path: string) => {
    const value = String(path);
    return value.endsWith('template.json') || value.endsWith('/basic');
  });
  mocks.readdirSync.mockImplementation((dir: string) => {
    if (String(dir).endsWith('/config')) return [dirent('cache.ts', 'file')];
    return [
      dirent('template.json', 'file'),
      dirent('.env.tpl', 'file'),
      dirent('render.txt.tpl', 'file'),
      dirent('path-bool-{{flag}}/file.txt', 'file'),
      dirent('path-boolfalse-{{flagFalse}}/file.txt', 'file'),
      dirent('path-num-{{num}}/file.txt', 'file'),
      dirent('path-undef-{{missing}}/file.txt', 'file'),
      dirent('config', 'dir'),
      dirent('symlink', 'other'),
    ];
  });
  mocks.readFileSync.mockImplementation((path: string) =>
    String(path).endsWith('template.json')
      ? templateMeta(meta)
      : '{{flag}}|{{flagFalse}}|{{num}}|{{big}}|{{missing}}|{{empty}}|{{renderBoolean}}'
  );
};

describe('ProjectScaffolder uncovered branches', () => {
  const originalNodeEnv = process.env['NODE_ENV'];

  const fresh = async (): Promise<ScaffolderModule> => {
    vi.resetModules();
    return import('@cli/scaffolding/ProjectScaffolder');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    mocks.mkdirSync.mockReturnValue(undefined);
    mocks.readdirSync.mockReturnValue([]);
    mocks.readFileSync.mockReturnValue('');
    mocks.writeFileSync.mockReturnValue(undefined);
    mocks.execFileSync.mockReturnValue('"1.2.3"');
    mocks.envData.mockReturnValue(['APP_KEY=base64:test', 'PORT=7777']);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalNodeEnv;
    vi.clearAllMocks();
  });

  it('defaults NODE_ENV and caches published versions including empty ones', async () => {
    delete process.env['NODE_ENV'];
    mocks.execFileSync.mockReturnValue('""');
    const first = await fresh();
    first.createProjectScaffolder('/workspace').prepareContext({ name: 'app' });
    expect(first.createProjectScaffolder('/workspace').getVariables).toBeDefined();
    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
    expect((mocks.execFileSync.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv }).env).toEqual(
      expect.objectContaining({ NODE_ENV: 'development', PATH: '/usr/local/bin:/usr/bin:/bin' })
    );
    expect(first.createProjectScaffolder('/workspace').getVariables()).toEqual({});
  });

  it('creates missing project and template directories', async () => {
    const mod = await fresh();
    const scaffolder = mod.createProjectScaffolder('/workspace');
    mocks.existsSync.mockReturnValue(false);
    expect(scaffolder.createDirectories()).toBeGreaterThan(0);
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/workspace', { recursive: true });
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/workspace/config', { recursive: true });

    mocks.mkdirSync.mockClear();
    mocks.existsSync.mockImplementation((path: string) => String(path) === '/workspace/config');
    scaffolder.createDirectories();
    expect(mocks.mkdirSync).not.toHaveBeenCalledWith('/workspace/config', { recursive: true });
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/workspace/app/Controllers', { recursive: true });
  });

  it('renders path and content variables of every supported type', async () => {
    withTemplate();
    const mod = await fresh();
    const scaffolder = mod.createProjectScaffolder('/workspace');
    scaffolder.prepareContext({ name: 'app' });
    Object.assign(scaffolder.getVariables(), {
      flag: true,
      flagFalse: false,
      num: 42,
      big: 123n,
      missing: undefined,
      empty: null,
      renderBoolean: false,
    });

    expect(scaffolder.createFiles()).toBeGreaterThan(0);
    const paths = mocks.writeFileSync.mock.calls.map((call) => String(call[0]));
    expect(paths).toContain('/workspace/app/path-bool-true/file.txt');
    expect(paths).toContain('/workspace/app/path-boolfalse-false/file.txt');
    expect(paths).toContain('/workspace/app/path-num-42/file.txt');
    expect(paths.some((path) => path.includes('/path-undef-/file.txt'))).toBe(true);
    const renderCall = mocks.writeFileSync.mock.calls.find((call) =>
      String(call[0]).endsWith('render.txt')
    );
    expect(renderCall?.[1]).toBe('true|false|42|123|||false');
    expect(paths.some((path) => path.endsWith('.env'))).toBe(false);
  });

  it('falls back to config defaults when variables are absent', async () => {
    const mod = await fresh();
    const scaffolder = mod.createProjectScaffolder('/workspace');
    Object.assign(scaffolder.getVariables(), {
      projectName: undefined,
      name: 'fallback-name',
      database: undefined,
      port: undefined,
    });
    expect(scaffolder.createConfigFile()).toBe(true);
    const config = JSON.parse(String(mocks.writeFileSync.mock.calls[0]?.[1] ?? '{}'));
    expect(config.name).toBe('fallback-name');
    expect(config.database.connection).toBe('sqlite');
    expect(config.server.port).toBe(7777);
  });

  it('backfills existing env files with default port when port is missing', async () => {
    mocks.existsSync.mockImplementation((path: string) => String(path).endsWith('.env'));
    const mod = await fresh();
    const scaffolder = mod.createProjectScaffolder('/workspace');
    expect(scaffolder.createEnvFile()).toBe(true);
    expect(mocks.backfill).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.objectContaining({ PORT: '7777' })
    );
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it.each([
    ['sqlserver', 'DB_HOST_MSSQL=localhost'],
    ['mssql', 'DB_PORT_MSSQL=1433'],
  ])('writes %s database overrides', (database, expectedLine) => {
    return (async () => {
      const mod = await fresh();
      const scaffolder = mod.createProjectScaffolder('/workspace');
      Object.assign(scaffolder.getVariables(), { projectName: 'app', database });
      expect(scaffolder.createEnvFile()).toBe(true);
      const envLine = mocks.envData.mock.calls.at(-1)?.[5] as string[];
      expect(envLine).toContain(expectedLine);
    })();
  });

  it.each([
    ['   ', 'zintrust'],
    ['---app---', 'app'],
    ['@@@', 'zintrust'],
  ])('normalizes the sqlite basename for %s', (projectName, expectedBasename) => {
    return (async () => {
      const mod = await fresh();
      const scaffolder = mod.createProjectScaffolder('/workspace');
      Object.assign(scaffolder.getVariables(), { projectName, database: 'sqlite' });
      expect(scaffolder.createEnvFile()).toBe(true);
      expect(mocks.envData.mock.calls.at(-1)?.[6]).toBe(`.zintrust/dbs/${expectedBasename}.sqlite`);
    })();
  });

  it('uses env defaults for non-string variables and appends a trailing newline', async () => {
    const mod = await fresh();
    const scaffolder = mod.createProjectScaffolder('/workspace');
    Object.assign(scaffolder.getVariables(), {
      projectName: 42,
      port: undefined,
      database: undefined,
    });
    expect(scaffolder.createEnvFile()).toBe(true);
    expect(mocks.envData.mock.calls.at(-1)?.[0]).toBe('zintrust-app');
    expect(mocks.envData.mock.calls.at(-1)?.[1]).toBe(7777);
    expect(mocks.envData.mock.calls.at(-1)?.[4]).toBe('sqlite');
    expect(mocks.writeFileSync.mock.calls.at(-1)?.[1]).toBe('APP_KEY=base64:test\nPORT=7777\n');

    mocks.envData.mockReturnValue(['APP_KEY=base64:test', 'PORT=7777', '']);
    expect(scaffolder.createEnvFile()).toBe(true);
    expect(mocks.writeFileSync.mock.calls.at(-1)?.[1]).toBe('APP_KEY=base64:test\nPORT=7777\n');
  });

  it('coerces malformed template metadata and skips non-file entries', async () => {
    withTemplate({ name: 'custom', directories: 'not-an-array' });
    const mod = await fresh();
    expect(mod.getTemplate('basic')?.name).toBe('custom');

    withTemplate({ directories: ['ok', 42] });
    const second = await fresh();
    expect(second.getTemplate('basic')?.directories).toEqual(['ok']);
  });

  it('falls back to built-in templates when disk templates are absent', async () => {
    mocks.existsSync.mockReturnValue(false);
    const mod = await fresh();
    expect(mod.getTemplate('basic')?.name).toBe('basic');
    expect(mod.getTemplate('api')?.name).toBe('api');
    expect(mod.getTemplate('unknown')).toBeUndefined();

    const scaffolder = mod.createProjectScaffolder('/workspace');
    scaffolder.prepareContext({ name: 'app', template: 'unknown' });
    scaffolder.createDirectories();
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/workspace/app/config', { recursive: true });
  });

  it('reports non-Error scaffold failures', async () => {
    mocks.mkdirSync.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain mkdir failure';
    });
    const mod = await fresh();
    const result = await mod.createProjectScaffolder('/workspace').scaffold({ name: 'app' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('plain mkdir failure');
    expect(mocks.error).toHaveBeenCalledWith('Project scaffolding failed', expect.anything());
  });
});
