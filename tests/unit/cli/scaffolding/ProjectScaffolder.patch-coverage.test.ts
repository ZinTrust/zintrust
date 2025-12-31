import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ProjectScaffolder patch coverage', () => {
  it('getTemplate returns the in-memory fallback when disk template is unavailable', async () => {
    vi.resetModules();

    const existsSync = vi.fn();
    existsSync.mockReturnValue(false);
    const readFileSync = vi.fn();
    readFileSync.mockReturnValue('');
    const readdirSync = vi.fn();
    readdirSync.mockReturnValue([]);
    const statSync = vi.fn();
    statSync.mockReturnValue({ isDirectory: () => false, isFile: () => false });

    // Force `loadTemplateFromDisk()` to return undefined by making existsSync fail.
    vi.doMock('@node-singletons/fs', () => ({
      default: {
        existsSync,
        readFileSync,
        readdirSync,
        statSync,
      },
    }));

    const mod = await import('@/cli/scaffolding/ProjectScaffolder');

    const tpl = mod.getTemplate('basic');
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe('basic');
  });
});
