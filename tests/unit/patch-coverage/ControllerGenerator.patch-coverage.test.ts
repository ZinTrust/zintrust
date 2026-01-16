import { describe, expect, it, vi } from 'vitest';

describe('ControllerGenerator', () => {
  it('validateOptions rejects bad input and generateController handles write failures', async () => {
    vi.resetModules();

    const writeFile = vi.fn(() => false);
    const dirExists = vi.fn(() => false);

    vi.doMock('@cli/scaffolding/FileGenerator', () => ({
      FileGenerator: { writeFile, directoryExists: dirExists },
    }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn() } }));
    vi.doMock('@node-singletons/path', () => ({ join: (...p: string[]) => p.join('/') }));

    const mod = await import('@cli/scaffolding/ControllerGenerator');

    const bad = { name: 'Bad', controllerPath: '/nope' } as any;
    const v = mod.validateOptions(bad);
    expect(v.valid).toBe(false);

    // Now simulate directory exists but write fails
    vi.resetModules();
    vi.doMock('@cli/scaffolding/FileGenerator', () => ({
      FileGenerator: { writeFile: vi.fn(() => false), directoryExists: () => true },
    }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn() } }));
    vi.doMock('@node-singletons/path', () => ({ join: (...p: string[]) => p.join('/') }));

    const mod2 = await import('@cli/scaffolding/ControllerGenerator');
    const res = await mod2.generateController({
      name: 'UserController',
      controllerPath: '/tmp',
      type: 'crud',
    } as any);
    expect(res.success).toBe(false);
    expect(res.message).toContain('Failed to create controller file');
  });

  it('generateController succeeds when writeFile true and exposes types', async () => {
    vi.resetModules();
    vi.doMock('@cli/scaffolding/FileGenerator', () => ({
      FileGenerator: { writeFile: vi.fn(() => true), directoryExists: () => true },
    }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn() } }));
    vi.doMock('@node-singletons/path', () => ({ join: (...p: string[]) => p.join('/') }));

    const mod = await import('@cli/scaffolding/ControllerGenerator');
    const res = await mod.generateController({
      name: 'UserController',
      controllerPath: '/tmp',
      type: 'api',
    } as any);
    expect(res.success).toBe(true);
    const types = mod.getAvailableTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types).toContain('crud');
  });
});
