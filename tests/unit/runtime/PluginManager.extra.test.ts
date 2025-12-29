import { PluginManager } from '@runtime/PluginManager';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const tmpDirRoot = path.join(os.tmpdir(), `zintrust-pm-${Date.now()}`);

describe('PluginManager extra tests', () => {
  beforeEach(async () => {
    await fs.mkdir(tmpDirRoot, { recursive: true });
    process.env['ZINTRUST_PROJECT_ROOT'] = tmpDirRoot;
  });
  afterEach(async () => {
    try {
      await fs.rm(tmpDirRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
    delete process.env['ZINTRUST_PROJECT_ROOT'];
  });

  it('resolves aliases and returns null for unknown ids', () => {
    expect(PluginManager.resolveId('auth')).toBe('feature:auth');
    expect(PluginManager.resolveId('a:postgres')).toBe('adapter:postgres');
    expect(PluginManager.resolveId('nope')).toBeNull();
  });

  it('detects installed plugin when template file and deps exist', async () => {
    // prepare project files and package.json
    const projectSrc = path.join(tmpDirRoot, 'src', 'features');
    await fs.mkdir(projectSrc, { recursive: true });
    await fs.writeFile(path.join(projectSrc, 'Auth.ts'), '// auth feature');

    const packageJson = {
      dependencies: { jsonwebtoken: '^1.0.0', bcrypt: '^1.0.0' },
    };

    await fs.writeFile(path.join(tmpDirRoot, 'package.json'), JSON.stringify(packageJson));

    const installed = await PluginManager.isInstalled('auth');
    expect(installed).toBe(true);

    // missing file or deps should return false
    await fs.rm(path.join(projectSrc, 'Auth.ts'));
    const missing = await PluginManager.isInstalled('auth');
    expect(missing).toBe(false);
  });
});
