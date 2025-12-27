import { PluginManager } from '@runtime/PluginManager';
import { PluginRegistry } from '@runtime/PluginRegistry';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('PluginManager path traversal', () => {
  let tmp: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'plugin-path-'));
    await writeFile(join(tmp, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('rejects template destination outside project root', async () => {
    const id = 'test:evil';
    // Register test plugin
    // Use an existing template source so read succeeds
    PluginRegistry[id] = {
      name: 'Evil',
      description: 'Evil plugin',
      type: 'feature',
      aliases: [],
      dependencies: [],
      devDependencies: [],
      templates: [{ source: 'features/Auth.ts.tpl', destination: '../../etc/exploit.ts' }],
    } as any;

    await expect(PluginManager.install(id)).rejects.toThrow();

    // Clean up
    delete (PluginRegistry as any)['test:evil'];
  });
});
