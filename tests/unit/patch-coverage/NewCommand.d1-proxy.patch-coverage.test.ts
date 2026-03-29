/* eslint-disable max-nested-callbacks */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: NewCommand --with-d1-proxy', () => {
  it('logs repo-managed D1 proxy guidance without adding a standalone dependency', async () => {
    vi.resetModules();

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-newcmd-'));
    const projectPath = path.join(tmp, 'app');

    vi.doMock('@cli/scaffolding/ProjectScaffolder', () => ({
      ProjectScaffolder: {
        scaffold: vi.fn((_basePath: string, cfg: any) => {
          fs.mkdirSync(projectPath, { recursive: true });
          fs.writeFileSync(
            path.join(projectPath, 'package.json'),
            JSON.stringify({ name: cfg.name, dependencies: {} }, null, 2) + '\n',
            'utf-8'
          );
          return { success: true };
        }),
      },
    }));

    const { NewCommand } = await import('@/cli/commands/NewCommand');
    const cmd = NewCommand.create();
    const info = vi.spyOn(cmd, 'info');

    await cmd.execute({
      args: [projectPath],
      interactive: false,
      'no-interactive': true,
      install: false,
      git: false,
      withD1Proxy: true,
    } as any);

    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies?.['@zintrust/cloudflare-d1-proxy']).toBeUndefined();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('D1 proxy Workers are now repo-managed')
    );

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('still logs guidance when package.json is missing', async () => {
    vi.resetModules();

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-newcmd-'));
    const projectPath = path.join(tmp, 'app');

    vi.doMock('@cli/scaffolding/ProjectScaffolder', () => ({
      ProjectScaffolder: {
        scaffold: vi.fn((_basePath: string, cfg: any) => {
          fs.mkdirSync(projectPath, { recursive: true });
          return { success: true, name: cfg.name };
        }),
      },
    }));

    const { NewCommand } = await import('@/cli/commands/NewCommand');
    const cmd = NewCommand.create();
    const info = vi.spyOn(cmd, 'info');

    await cmd.execute({
      args: [projectPath],
      interactive: false,
      'no-interactive': true,
      install: false,
      git: false,
      withD1Proxy: true,
    } as any);

    expect(info).toHaveBeenCalledWith(expect.stringContaining('Use @zintrust/core/proxy'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
