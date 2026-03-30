import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: loggerMocks.debug,
  },
}));

const createTempProject = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'zintrust-worker-entry-'));

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
  }

  return root;
};

const getWorkerEntrypoints = (): string[] => {
  return (globalThis as { __workerEntrypoints?: string[] }).__workerEntrypoints ?? [];
};

describe('WorkerProjectAutoImports', () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env['ZINTRUST_PROJECT_ROOT'];
    delete (globalThis as { __workerEntrypoints?: string[] }).__workerEntrypoints;
  });

  afterEach(() => {
    delete process.env['ZINTRUST_PROJECT_ROOT'];
    delete (globalThis as { __workerEntrypoints?: string[] }).__workerEntrypoints;

    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root !== undefined) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  });

  it('returns not-found when no worker entrypoint candidate exists', async () => {
    const projectRoot = createTempProject({});
    tempRoots.push(projectRoot);
    process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;

    const { WorkerProjectAutoImports } = await import('@runtime/WorkerProjectAutoImports');

    await expect(WorkerProjectAutoImports.tryImportProjectWorkerEntrypoint()).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('invokes a named registerWorkers export when present', async () => {
    const projectRoot = createTempProject({
      'dist/src/zintrust.workers.js': [
        'export async function registerWorkers() {',
        '  const state = globalThis;',
        '  state.__workerEntrypoints = [...(state.__workerEntrypoints ?? []), "named"];',
        '}',
      ].join('\n'),
    });
    tempRoots.push(projectRoot);
    process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;

    const { WorkerProjectAutoImports } = await import('@runtime/WorkerProjectAutoImports');
    const result = await WorkerProjectAutoImports.tryImportProjectWorkerEntrypoint();

    expect(result).toEqual({
      ok: true,
      loadedPath: join(projectRoot, 'dist', 'src', 'zintrust.workers.js'),
    });
    expect(getWorkerEntrypoints()).toEqual(['named']);
  });

  it('invokes a default export when registerWorkers is absent', async () => {
    const projectRoot = createTempProject({
      'src/zintrust.workers.js': [
        'export default async function registerDefaultWorkers() {',
        '  const state = globalThis;',
        '  state.__workerEntrypoints = [...(state.__workerEntrypoints ?? []), "default"];',
        '}',
      ].join('\n'),
    });
    tempRoots.push(projectRoot);
    process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;

    const { WorkerProjectAutoImports } = await import('@runtime/WorkerProjectAutoImports');
    const result = await WorkerProjectAutoImports.tryImportProjectWorkerEntrypoint();

    expect(result).toEqual({
      ok: true,
      loadedPath: join(projectRoot, 'src', 'zintrust.workers.js'),
    });
    expect(getWorkerEntrypoints()).toEqual(['default']);
  });

  it('falls back to a later candidate after an import failure', async () => {
    const projectRoot = createTempProject({
      'dist/src/zintrust.workers.js': 'throw new Error("dist fail");\n',
      'src/zintrust.workers.js': [
        'export default async function registerFallbackWorkers() {',
        '  const state = globalThis;',
        '  state.__workerEntrypoints = [...(state.__workerEntrypoints ?? []), "fallback"];',
        '}',
      ].join('\n'),
    });
    tempRoots.push(projectRoot);
    process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;

    const { WorkerProjectAutoImports } = await import('@runtime/WorkerProjectAutoImports');
    const result = await WorkerProjectAutoImports.tryImportProjectWorkerEntrypoint();

    expect(result).toEqual({
      ok: true,
      loadedPath: join(projectRoot, 'src', 'zintrust.workers.js'),
    });
    expect(getWorkerEntrypoints()).toEqual(['fallback']);
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      '[workers] Project worker entrypoint import failed',
      expect.objectContaining({
        candidate: join(projectRoot, 'dist', 'src', 'zintrust.workers.js'),
        errorMessage: 'dist fail',
      })
    );
  });

  it('returns the first import failure when all candidates fail', async () => {
    const projectRoot = createTempProject({
      'dist/src/zintrust.workers.js': 'throw new Error("dist fail");\n',
      'src/zintrust.workers.js': 'throw new Error("src fail");\n',
    });
    tempRoots.push(projectRoot);
    process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;

    const { WorkerProjectAutoImports } = await import('@runtime/WorkerProjectAutoImports');

    await expect(WorkerProjectAutoImports.tryImportProjectWorkerEntrypoint()).resolves.toEqual({
      ok: false,
      loadedPath: join(projectRoot, 'dist', 'src', 'zintrust.workers.js'),
      reason: 'import-failed',
      errorMessage: 'dist fail',
    });
    expect(loggerMocks.debug).toHaveBeenCalledTimes(2);
  });
});
