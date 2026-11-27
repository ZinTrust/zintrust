import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  directoryExists: vi.fn((_path: string) => false),
  createDirectory: vi.fn(),
  writeFile: vi.fn(() => true),
  fileExists: vi.fn((_path: string) => false),
  readFile: vi.fn((_path: string) => ''),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@cli/scaffolding/FileGenerator', () => ({
  FileGenerator: {
    directoryExists: (...args: unknown[]) => (mocks.directoryExists as (...a: any[]) => any)(...args),
    createDirectory: (...args: unknown[]) => mocks.createDirectory(...args),
    writeFile: (...args: unknown[]) => (mocks.writeFile as (...a: any[]) => any)(...args),
    fileExists: (...args: unknown[]) => (mocks.fileExists as (...a: any[]) => any)(...args),
    readFile: (...args: unknown[]) => (mocks.readFile as (...a: any[]) => any)(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

vi.mock('@helper/index', () => ({
  isArray: (value: unknown) => Array.isArray(value),
  isObject: (value: unknown) =>
    typeof value === 'object' && value !== null && !Array.isArray(value),
}));

import {
  ServiceScaffolder,
  type ServiceOptions,
} from '@cli/scaffolding/ServiceScaffolder';

const options = (overrides: Partial<ServiceOptions> = {}): ServiceOptions => ({
  name: 'users',
  ...overrides,
});

const writtenContent = (suffix: string): string | undefined =>
  mocks.writeFile.mock.calls
    .find((call) => String(call[0]).endsWith(suffix))
    ?.[1] as string | undefined;

describe('ServiceScaffolder uncovered branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directoryExists.mockReturnValue(false);
    mocks.createDirectory.mockImplementation(() => undefined);
    mocks.writeFile.mockReturnValue(true);
    mocks.fileExists.mockReturnValue(false);
    mocks.readFile.mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a validation failure without touching the filesystem', async () => {
    const result = await ServiceScaffolder.scaffold('/project', options({ name: 'Users' }));

    expect(result.success).toBe(false);
    expect(result.message).toContain('Validation failed');
    expect(mocks.createDirectory).not.toHaveBeenCalled();
  });

  it('creates an initial manifest when none exists and adds runtime files', async () => {
    const result = await ServiceScaffolder.scaffold('/project', options());

    expect(result.success).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('src/bootstrap/service-manifest.ts'),
      expect.stringContaining('port: 3001')
    );
    expect(writtenContent('src/bootstrap/service-manifest.ts')).toContain(
      "id: 'default/users'"
    );
    expect(writtenContent('src/zintrust.runtime.ts')).toContain('serviceManifestModule');
    expect(writtenContent('src/zintrust.runtime.wg.ts')).toContain('serviceManifestModule');
  });

  it('skips manifest updates when the service is already registered', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('service-manifest.ts'));
    mocks.readFile.mockImplementation(() => "export const serviceManifest = [{ id: 'default/users' }];");

    const result = await ServiceScaffolder.scaffold('/project', options({ port: 4000 }));

    expect(result.success).toBe(true);
    expect(mocks.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining('service-manifest.ts'),
      expect.stringContaining("id: 'ecommerce/users'"),
      expect.anything()
    );
  });

  it('inserts a new manifest entry before the closing marker', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('service-manifest.ts'));
    mocks.readFile.mockReturnValue('export const serviceManifest = [];\n');

    const result = await ServiceScaffolder.scaffold(
      '/project',
      options({ domain: 'ecommerce', port: 4100 })
    );

    expect(result.success).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('service-manifest.ts'),
      expect.stringContaining("id: 'ecommerce/users'"),
      { overwrite: true }
    );
    expect(writtenContent('src/bootstrap/service-manifest.ts')).toContain('port: 4100');
  });

  it('warns when the manifest has no closing marker', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('service-manifest.ts'));
    mocks.readFile.mockReturnValue('export const serviceManifest = [');

    await ServiceScaffolder.scaffold('/project', options());

    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('manifest format is unsupported'));
  });

  it('skips Cloudflare target updates when .zintrust.json is absent', async () => {
    mocks.fileExists.mockImplementation((path: string) => !path.endsWith('.zintrust.json'));

    await ServiceScaffolder.scaffold('/project', options());

    expect(mocks.readFile).not.toHaveBeenCalledWith(expect.stringContaining('.zintrust.json'));
  });

  it('ignores non-object and malformed .zintrust.json configuration', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.readFile.mockReturnValue('null');
    await ServiceScaffolder.scaffold('/project', options());
    expect(mocks.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining('.zintrust.json'),
      expect.anything(),
      expect.anything()
    );

    mocks.writeFile.mockClear();
    mocks.readFile.mockReturnValue('{ invalid json');
    await ServiceScaffolder.scaffold('/project', options());
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('Unable to update'));
  });

  it('reports non-Error failures while updating Cloudflare targets', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.readFile.mockImplementation(() => {
      throw 'plain read failure';
    });

    await ServiceScaffolder.scaffold('/project', options());

    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('plain read failure'));
  });

  it('adds a Cloudflare target when none exists for the service', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.readFile.mockReturnValue(JSON.stringify({ cloudflare: { shared_env: ['APP_KEY'] } }));

    const result = await ServiceScaffolder.scaffold('/project', options({ domain: 'shop' }));

    expect(result.success).toBe(true);
    expect(writtenContent('.zintrust.json')).toContain('shop/users');
  });

  it('leaves an existing Cloudflare target array untouched', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.readFile.mockReturnValue(
      JSON.stringify({ cloudflare: { targets: { 'shop/users': ['existing'] } } })
    );

    await ServiceScaffolder.scaffold('/project', options({ domain: 'shop' }));

    expect(mocks.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining('.zintrust.json'),
      expect.anything(),
      expect.anything()
    );
  });

  it('uses default domain and no Cloudflare section when config has neither', async () => {
    mocks.fileExists.mockImplementation((path: string) => path.endsWith('.zintrust.json'));
    mocks.readFile.mockReturnValue(JSON.stringify({ name: 'plain-project' }));

    const result = await ServiceScaffolder.scaffold('/project', options());

    expect(result.success).toBe(true);
    expect(writtenContent('.zintrust.json')).toContain('default/users');
  });

  it('uses isolated database template content when requested', async () => {
    const result = await ServiceScaffolder.scaffold(
      '/project',
      options({ database: 'isolated', auth: 'jwt' })
    );

    expect(result.success).toBe(true);
    expect(writtenContent('src/index.ts')).toContain('Database: isolated');
    expect(writtenContent('.env')).toContain('DATABASE_CONNECTION=postgresql');
    expect(writtenContent('README.md')).toContain('isolated database instance');
  });

  it('returns a failure result when directory creation throws', async () => {
    mocks.createDirectory.mockImplementation(() => {
      throw new Error('disk unavailable');
    });

    const result = await ServiceScaffolder.scaffold('/project', options());

    expect(result.success).toBe(false);
    expect(result.message).toBe('disk unavailable');
    expect(mocks.error).toHaveBeenCalledWith('Service scaffolding failed', expect.any(Error));
  });
});
