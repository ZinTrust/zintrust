import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

describe('patch coverage: NewCommand --with-d1-proxy', () => {
  it('adds @zintrust/cloudflare-d1-proxy to dependencies when enabled', async () => {
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

    await cmd.execute({
      args: [projectPath],
      interactive: false,
      'no-interactive': true,
      install: false,
      git: false,
      withD1Proxy: true,
    } as any);

    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
    expect(typeof pkg.dependencies?.['@zintrust/cloudflare-d1-proxy']).toBe('string');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('warns when package.json exists but cannot be parsed', async () => {
    vi.resetModules();

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-newcmd-'));
    const projectPath = path.join(tmp, 'app');

    vi.doMock('@cli/scaffolding/ProjectScaffolder', () => ({
      ProjectScaffolder: {
        scaffold: vi.fn((_basePath: string, cfg: any) => {
          fs.mkdirSync(projectPath, { recursive: true });
          fs.writeFileSync(path.join(projectPath, 'package.json'), '{ nope', 'utf-8');
          return { success: true, name: cfg.name };
        }),
      },
    }));

    const { NewCommand } = await import('@/cli/commands/NewCommand');
    const cmd = NewCommand.create();
    const warn = vi.spyOn(cmd, 'warn');

    await cmd.execute({
      args: [projectPath],
      interactive: false,
      'no-interactive': true,
      install: false,
      git: false,
      withD1Proxy: true,
    } as any);

    expect(warn).toHaveBeenCalled();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('warns when package.json is missing (covers warn+return branch)', async () => {
    vi.resetModules();

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-newcmd-'));
    const projectPath = path.join(tmp, 'app');

    vi.doMock('@cli/scaffolding/ProjectScaffolder', () => ({
      ProjectScaffolder: {
        scaffold: vi.fn((_basePath: string) => {
          fs.mkdirSync(projectPath, { recursive: true });
          // intentionally do not create package.json
          return { success: true };
        }),
      },
    }));

    const { NewCommand } = await import('@/cli/commands/NewCommand');
    const cmd = NewCommand.create();
    const warn = vi.spyOn(cmd, 'warn');

    await cmd.execute({
      args: [projectPath],
      interactive: false,
      'no-interactive': true,
      install: false,
      git: false,
      withD1Proxy: true,
    } as any);

    expect(warn).toHaveBeenCalled();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
