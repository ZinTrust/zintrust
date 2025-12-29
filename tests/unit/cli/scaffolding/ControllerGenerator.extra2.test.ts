import { describe, expect, it, vi } from 'vitest';

describe('ControllerGenerator validation and error branches', () => {
  it('validateOptions returns errors for bad name, missing dir and invalid type', async () => {
    // Mock the FileGenerator module before importing ControllerGenerator
    vi.mock('@cli/scaffolding/FileGenerator', () => ({
      FileGenerator: {
        directoryExists: () => false,
        writeFile: () => true,
      },
    }));

    const { validateOptions } = await import('@cli/scaffolding/ControllerGenerator');

    const res = validateOptions({
      name: 'BadName',
      controllerPath: '/no/dir',
      type: 'notatype' as any,
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Invalid controller name'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Controllers directory does not exist'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Invalid controller type'))).toBe(true);

    vi.unmock('@cli/scaffolding/FileGenerator');
  });

  it('generateController handles thrown errors gracefully', async () => {
    // Ensure module cache is cleared so our mock is used
    vi.resetModules();
    vi.resetModules();
    const tmpDir = `/tmp/zintrust-test-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    vi.mock('@cli/scaffolding/FileGenerator', () => ({
      FileGenerator: {
        directoryExists: () => true,
        writeFile: (_p: string, _c: string) => {
          throw new Error('write failure');
        },
      },
    }));

    const { generateController } = await import('@cli/scaffolding/ControllerGenerator');

    const result = await generateController({
      name: 'ApiTestController',
      controllerPath: tmpDir,
      type: 'api',
    });

    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);

    vi.unmock('@cli/scaffolding/FileGenerator');
  });
});
