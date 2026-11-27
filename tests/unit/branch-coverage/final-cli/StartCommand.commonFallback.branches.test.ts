import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn((_path: string) => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((_path: string) => ''),
  writeFileSync: vi.fn(),
  spawnAndWait: vi.fn(async () => 0),
  ensureLoaded: vi.fn(),
  applyCliOverrides: vi.fn(),
  readEnvString: vi.fn((_key: string, fallback?: string) => fallback ?? ''),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as (...a: any[]) => any)(...args),
  mkdirSync: (...args: unknown[]) => mocks.mkdirSync(...args),
  readFileSync: (...args: unknown[]) => (mocks.readFileSync as (...a: any[]) => any)(...args),
  writeFileSync: (...args: unknown[]) => mocks.writeFileSync(...args),
}));

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: (...args: unknown[]) => mocks.ensureLoaded(...args),
    applyCliOverrides: (...args: unknown[]) => mocks.applyCliOverrides(...args),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: (...args: unknown[]) => (mocks.spawnAndWait as (...a: any[]) => any)(...args) },
}));

vi.mock('@cli/cloudflare/CloudflareWranglerDevEnv', () => ({
  withWranglerDevVarsSnapshot: async (_args: unknown, callback: () => unknown) => callback(),
}));

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: (...args: unknown[]) => (mocks.readEnvString as (...a: any[]) => any)(...args),
}));

vi.mock('@runtime/ProjectRuntime', () => ({
  ProjectRuntime: { clear: vi.fn(), tryLoadNodeRuntime: vi.fn(), getServiceManifest: () => [] },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, warn: mocks.warn, error: mocks.error },
}));

// Both optional Common helpers are present but non-callable to exercise typeof fallbacks.
vi.mock('@common/index', () => ({ resolveNpmPath: undefined, runFromSource: undefined }));

import { StartCommand } from '@cli/commands/StartCommand';

const PROJECT_ROOT = '/workspace';

describe('StartCommand optional Common helper fallbacks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.spyOn(process, 'cwd').mockReturnValue(PROJECT_ROOT);
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit: ${code}`);
    });
    mocks.spawnAndWait.mockResolvedValue(0);
    mocks.readEnvString.mockImplementation((_key: string, fallback?: string) => fallback ?? '');
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('uses npm when resolveNpmPath is unavailable', async () => {
    mocks.existsSync.mockImplementation((path: string) =>
      String(path) === `${PROJECT_ROOT}/package.json`
    );
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ name: 'my-app', scripts: { dev: 'custom-dev' } })
    );

    await expect(StartCommand.create().execute({ mode: 'development' })).rejects.toThrow(
      /process.exit/
    );

    expect(mocks.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'npm', args: ['run', 'dev'] })
    );
  });

  it('treats a missing runFromSource helper as false', async () => {
    mocks.existsSync.mockImplementation((path: string) => {
      const value = String(path);
      return (
        value === `${PROJECT_ROOT}/package.json` || value.endsWith('dist/src/boot/bootstrap.js')
      );
    });

    await expect(StartCommand.create().execute({ mode: 'production' })).rejects.toThrow(
      /process.exit/
    );

    expect(mocks.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'node',
        env: expect.objectContaining({ ZINTRUST_BOOTSTRAP_PREFERENCE: 'compiled' }),
      })
    );
  });
});
