/* eslint-disable no-empty */
import fs, { fsPromises } from '@node-singletons/fs';
import os from '@node-singletons/os';
import path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateController,
  getAvailableTypes,
  validateOptions,
} from '@cli/scaffolding/ControllerGenerator';

const tmpRoot = path.join(os.tmpdir(), `zintrust-controller-${Date.now()}`);
let controllerDir = '';

describe('ControllerGenerator extra tests', () => {
  beforeEach(async () => {
    controllerDir = path.join(tmpRoot, `controllers-${Date.now()}`);
    await fsPromises.mkdir(controllerDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fsPromises.rm(controllerDir, { recursive: true, force: true });
    } catch {}
    vi.restoreAllMocks();
  });

  it('validateOptions rejects invalid names and missing directories', () => {
    const r1 = validateOptions({ name: 'BadName', controllerPath: controllerDir });
    expect(r1.valid).toBe(false);
    expect(r1.errors.some((e) => e.includes("Must end with 'Controller'"))).toBe(true);

    const r2 = validateOptions({ name: 'OkController', controllerPath: '/does/not/exist' });
    expect(r2.valid).toBe(false);
    expect(r2.errors.some((e) => e.includes('Controllers directory does not exist'))).toBe(true);

    const r3 = validateOptions({ name: 'UsersController', controllerPath: controllerDir });
    expect(r3.valid).toBe(true);
  });

  it('generateController creates API controller file successfully', async () => {
    const opts = { name: 'ApiTestController', controllerPath: controllerDir, type: 'api' as const };
    const res = await generateController(opts);
    expect(res.success).toBe(true);

    const filePath = path.join(controllerDir, `${opts.name}.ts`);
    expect(fs.existsSync(filePath)).toBe(true);

    const txt = await fsPromises.readFile(filePath, 'utf8');
    expect(txt).toContain(opts.name);
    expect(txt).toContain('handleRequest');

    await fsPromises.rm(filePath, { force: true });
  });

  it('generateController creates GraphQL controller with executeQuery', async () => {
    const opts = {
      name: 'GqlControllerController',
      controllerPath: controllerDir,
      type: 'graphql' as const,
    };
    const res = await generateController(opts);
    expect(res.success).toBe(true);

    const filePath = path.join(controllerDir, `${opts.name}.ts`);
    const txt = await fsPromises.readFile(filePath, 'utf8');
    expect(txt).toContain(opts.name);
    expect(txt).toContain('executeQuery');

    await fsPromises.rm(filePath, { force: true });
  });

  it('returns failure when target file already exists (no overwrite)', async () => {
    const opts = {
      name: 'WillNotCreateController',
      controllerPath: controllerDir,
      type: 'api' as const,
    };
    // pre-create a file to simulate existing controller (writeFile should skip and return false)
    const target = path.join(controllerDir, `${opts.name}.ts`);
    await fsPromises.writeFile(target, '// existing');

    const res = await generateController(opts);
    expect(res.success).toBe(false);
    expect(res.message).toContain('Failed to create controller file');

    await fsPromises.rm(target, { force: true });
  });

  it('getAvailableTypes contains primary controller types', () => {
    const types = getAvailableTypes();
    expect(types).toContain('crud');
    expect(types).toContain('api');
    expect(types).toContain('graphql');
    expect(types).toContain('webhook');
  });
});
