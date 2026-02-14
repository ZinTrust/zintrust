import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createTempDir = (prefix: string): string => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const real = (p: string): string => fs.realpathSync.native(p);

describe('publicRoot', () => {
  const originalCwd = process.cwd();
  const tempDirs: string[] = [];
  const originalProjectRoot = process.env['ZINTRUST_PROJECT_ROOT'];

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalProjectRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = originalProjectRoot;

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('findPackageRoot returns nearest ancestor with package.json', async () => {
    const root = createTempDir('zt-public-root-');
    tempDirs.push(root);
    const nested = path.join(root, 'a/b/c');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{}', 'utf-8');

    const mod = await import('@core-routes/publicRoot');
    expect(mod.findPackageRoot(nested)).toBe(root);
  });

  it('findPackageRootAsync returns startDir when no package found within search depth', async () => {
    const root = createTempDir('zt-public-root-depth-');
    tempDirs.push(root);
    const deep = path.join(root, 'x1/x2/x3/x4/x5/x6/x7/x8/x9/x10/x11/x12');
    fs.mkdirSync(deep, { recursive: true });

    const mod = await import('@core-routes/publicRoot');
    const resolved = await mod.findPackageRootAsync(deep);
    expect(resolved).toBe(deep);
  });

  it('getPublicRoot prefers app public with index.html', async () => {
    const appRoot = createTempDir('zt-public-app-');
    const frameworkMarker = createTempDir('zt-public-fw-');
    tempDirs.push(appRoot, frameworkMarker);

    process.chdir(appRoot);
    fs.mkdirSync(path.join(appRoot, 'public'), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'public/index.html'), '<h1>app</h1>', 'utf-8');

    vi.doMock('@common/index', () => ({
      esmDirname: () => frameworkMarker,
    }));

    const mod = await import('@core-routes/publicRoot');
    expect(real(mod.getPublicRoot())).toBe(real(path.join(appRoot, 'public')));
  });

  it('getPublicRoot falls back to first existing candidate when no index exists', async () => {
    const appRoot = createTempDir('zt-public-app-no-index-');
    const frameworkMarker = createTempDir('zt-public-fw-no-index-');
    tempDirs.push(appRoot, frameworkMarker);

    process.chdir(appRoot);
    fs.mkdirSync(path.join(appRoot, 'public'), { recursive: true });

    vi.doMock('@common/index', () => ({
      esmDirname: () => frameworkMarker,
    }));

    const mod = await import('@core-routes/publicRoot');
    expect(real(mod.getPublicRoot())).toBe(real(path.join(appRoot, 'public')));
  });

  it('getPublicRootAsync returns framework dist/public when it has index', async () => {
    const appRoot = createTempDir('zt-public-app-async-');
    const frameworkRoot = createTempDir('zt-public-fw-async-');
    const frameworkStartDir = path.join(frameworkRoot, 'src/routes');
    tempDirs.push(appRoot, frameworkRoot);

    process.chdir(appRoot);
    fs.mkdirSync(frameworkStartDir, { recursive: true });
    fs.writeFileSync(path.join(frameworkRoot, 'package.json'), '{}', 'utf-8');
    fs.mkdirSync(path.join(frameworkRoot, 'dist/public'), { recursive: true });
    fs.writeFileSync(path.join(frameworkRoot, 'dist/public/index.html'), '<h1>fw</h1>', 'utf-8');

    vi.doMock('@common/index', () => ({
      esmDirname: () => frameworkStartDir,
    }));

    const mod = await import('@core-routes/publicRoot');
    const resolved = await mod.getPublicRootAsync();
    expect(resolved).toBe(path.join(frameworkRoot, 'dist/public'));
  });

  it('getPublicRootAsync returns first candidate when none exist', async () => {
    const appRoot = createTempDir('zt-public-async-none-');
    const frameworkMarker = createTempDir('zt-public-fw-none-');
    tempDirs.push(appRoot, frameworkMarker);

    process.chdir(appRoot);

    vi.doMock('@common/index', () => ({
      esmDirname: () => frameworkMarker,
    }));

    const mod = await import('@core-routes/publicRoot');
    const resolved = await mod.getPublicRootAsync();
    expect(path.basename(resolved)).toBe('public');
    expect(real(path.dirname(resolved))).toBe(real(appRoot));
  });
});
