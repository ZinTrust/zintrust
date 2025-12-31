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

    // Force `loadTemplateFromDisk()` to return undefined by making existsSync fail.
    vi.doMock('@node-singletons/fs', () => ({
      default: {
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(() => ''),
        readdirSync: vi.fn(() => []),
        statSync: vi.fn(() => ({ isDirectory: () => false, isFile: () => false })),
      },
    }));

    const mod = await import('@/cli/scaffolding/ProjectScaffolder');

    const tpl = mod.getTemplate('basic');
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe('basic');
  });
});
