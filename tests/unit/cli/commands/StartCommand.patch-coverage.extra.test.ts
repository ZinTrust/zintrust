/* eslint-disable max-nested-callbacks */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: vi.fn(),
    applyCliOverrides: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: vi.fn(async () => 0),
    spawnAndWaitWithOutput: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  },
}));

import { StartCommand } from '@/cli/commands/StartCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import * as NodeFs from '@node-singletons/fs';

const makeTempProject = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-startcmd-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export {}\n', 'utf-8');
  fs.writeFileSync(path.join(dir, 'wrangler.toml'), 'name = "test"\n', 'utf-8');
  return dir;
};

describe('StartCommand patch coverage extra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for invalid --mode (covers createCliError branch)', async () => {
    const cmd = StartCommand.create();
    await expect(cmd.execute({ mode: 'nope' } as any)).rejects.toThrow(/Invalid --mode/);
  });

  it('covers deno/lambda runtime conflicts + testing mode errors', async () => {
    const cmd = StartCommand.create();

    await expect(cmd.execute({ deno: true, runtime: 'nodejs' } as any)).rejects.toThrow(
      /--runtime cannot be used with --deno/
    );

    await expect(cmd.execute({ lambda: true, runtime: 'nodejs' } as any)).rejects.toThrow(
      /--runtime cannot be used with --lambda/
    );

    await expect(cmd.execute({ deno: true, mode: 'testing' } as any)).rejects.toThrow(
      /Cannot start server in testing mode/
    );

    await expect(cmd.execute({ lambda: true, mode: 'testing' } as any)).rejects.toThrow(
      /Cannot start server in testing mode/
    );
  });

  it('throws when multiple start variants are selected', async () => {
    const cmd = StartCommand.create();

    await expect(
      cmd.execute({ wrangler: true, deno: true, mode: 'development' } as any)
    ).rejects.toThrow(/Choose only one of --wrangler\/--wg, --deno, or --lambda/);
  });

  it('covers tmp dir and tmp runner write failures', async () => {
    const cmd = StartCommand.create();

    const mkdirSpy = vi.spyOn(NodeFs, 'mkdirSync').mockImplementationOnce(() => {
      throw new Error('mkdir fail');
    });

    await expect(cmd.execute({ deno: true, mode: 'development' } as any)).rejects.toThrow(
      /Failed to create tmp directory/
    );
    mkdirSpy.mockRestore();

    vi.spyOn(NodeFs, 'mkdirSync');
    const writeSpy = vi.spyOn(NodeFs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('write fail');
    });

    await expect(cmd.execute({ lambda: true, mode: 'development' } as any)).rejects.toThrow(
      /Failed to write start runner/
    );

    writeSpy.mockRestore();
  });

  it('covers executeStart returns for wrangler and deno', async () => {
    const originalCwd = process.cwd();
    const originalExit = process.exit;

    const tmp = makeTempProject();
    process.chdir(tmp);
    // IMPORTANT: avoid terminating vitest; we want the code path to reach `return;`
    (process as any).exit = vi.fn();

    try {
      const cmd = StartCommand.create();

      await cmd.execute({ wrangler: true, mode: 'development' } as any);
      await cmd.execute({ deno: true, mode: 'development', watch: false } as any);

      expect(SpawnUtil.spawnAndWait).toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      (process as any).exit = originalExit;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('passes explicit --wrangler-config through to wrangler args (covers trim + --config push)', async () => {
    const originalCwd = process.cwd();
    const originalExit = process.exit;

    const tmp = makeTempProject();
    process.chdir(tmp);
    (process as any).exit = vi.fn();

    try {
      const cmd = StartCommand.create();
      await cmd.execute({
        wrangler: true,
        mode: 'development',
        env: 'staging',
        wranglerConfig: '  wrangler.toml  ',
      } as any);

      expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'wrangler',
          args: expect.arrayContaining(['--config', 'wrangler.toml', '--env', 'staging']),
        })
      );
    } finally {
      process.chdir(originalCwd);
      (process as any).exit = originalExit;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws when explicit --wrangler-config path does not exist', async () => {
    const originalCwd = process.cwd();
    const tmp = makeTempProject();
    process.chdir(tmp);

    try {
      const cmd = StartCommand.create();
      await expect(
        cmd.execute({
          wrangler: true,
          mode: 'development',
          env: 'staging',
          wranglerConfig: 'missing.toml',
        } as any)
      ).rejects.toThrow(/Wrangler config not found: missing\.toml/);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws for invalid APP_PORT/PORT env (covers env port validation branch)', async () => {
    const envBackup = { ...process.env };
    process.env['APP_PORT'] = '99999';

    try {
      const cmd = StartCommand.create();
      await expect(cmd.execute({ mode: 'development' } as any)).rejects.toThrow(
        /Invalid APP_PORT\/PORT/
      );
    } finally {
      process.env = envBackup;
    }
  });

  it('covers executeStart return for lambda', async () => {
    const originalCwd = process.cwd();
    const originalExit = process.exit;

    const tmp = makeTempProject();
    process.chdir(tmp);
    // avoid terminating vitest; we want code to proceed past executeLambdaStart
    (process as any).exit = vi.fn();

    try {
      const cmd = StartCommand.create();
      await cmd.execute({ lambda: true, mode: 'development', watch: false } as any);

      expect(SpawnUtil.spawnAndWait).toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      (process as any).exit = originalExit;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('throws when both --cache and --no-cache flags are present (covers cache preference conflict)', async () => {
    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--cache', '--no-cache'];

    try {
      const cmd = StartCommand.create();
      await expect(cmd.execute({ mode: 'development' } as any)).rejects.toThrow(
        /Cannot use both --cache and --no-cache/
      );
    } finally {
      process.argv = originalArgv;
    }
  });
});
