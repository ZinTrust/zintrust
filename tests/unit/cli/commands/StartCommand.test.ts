import { resolveNpmPath } from '@/common';
import { StartCommand } from '@cli/commands/StartCommand';
import { SpawnUtil } from '@cli/utils/spawn';
import * as fs from '@node-singletons/fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: vi.fn(),
    applyCliOverrides: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/common', () => ({
  resolveNpmPath: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

describe('StartCommand', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    vi.spyOn(process, 'exit').mockImplementation((code: any) => {
      throw new Error(`process.exit: ${code}`);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  it('should have correct name and description', () => {
    const command = StartCommand.create();
    expect(command.name).toBe('start');
    expect(command.description).toBeDefined();
  });

  it('should start in development mode by default', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('bootstrap.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'tsx',
        args: ['watch', 'src/boot/bootstrap.ts'],
      })
    );
  });

  it('should start in production mode when --mode production is provided', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('bootstrap.js')) return true;
      return false;
    });
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({ mode: 'production' })).rejects.toThrow(/process.exit/);

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'node',
        args: ['dist/src/boot/bootstrap.js'],
      })
    );
  });

  it('should start in wrangler mode when --wrangler is provided', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('wrangler.toml')) return true;
      return false;
    });
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({ wrangler: true })).rejects.toThrow(/process.exit/);

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'wrangler',
        args: ['dev'],
      })
    );
  });

  it('should handle invalid mode', async () => {
    const command = StartCommand.create();
    await expect(command.execute({ mode: 'invalid' })).rejects.toThrow(/Invalid --mode/);
  });

  it('should handle invalid port', async () => {
    const command = StartCommand.create();
    await expect(command.execute({ port: '99999' })).rejects.toThrow(/Invalid --port/);
  });

  it('should handle both --watch and --no-watch', async () => {
    const command = StartCommand.create();
    process.argv.push('--watch', '--no-watch');
    await expect(command.execute({})).rejects.toThrow(/Cannot use both --watch and --no-watch/);
  });

  it('should handle missing package.json', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(command.execute({})).rejects.toThrow(/No Zintrust app found/);
  });

  it('should handle missing production build', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(command.execute({ mode: 'production' })).rejects.toThrow(/Compiled app not found/);
  });

  it('should handle testing mode error', async () => {
    const command = StartCommand.create();
    await expect(command.execute({ mode: 'testing' })).rejects.toThrow(
      /Cannot start server in testing mode/
    );
  });

  it('should register options', () => {
    const command = StartCommand.create();
    const mockCommander = {
      alias: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
    } as any;

    // @ts-ignore
    command.addOptions(mockCommander);

    expect(mockCommander.alias).toHaveBeenCalledWith('s');
  });

  it('should throw error when --wrangler and --runtime are used together', async () => {
    const command = StartCommand.create();
    await expect(command.execute({ wrangler: true, runtime: 'nodejs' })).rejects.toThrow(
      /--runtime is not supported with --wrangler/
    );
  });

  it('should throw error when wrangler config and entry are missing', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(command.execute({ wrangler: true })).rejects.toThrow(/wrangler config not found/);
  });

  it('should use wrangler entry if config is missing', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('cloudflare.ts')) return true;
      return false;
    });
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({ wrangler: true })).rejects.toThrow(/process.exit/);
  });

  it('should pass port to wrangler', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('wrangler.toml')) return true;
      return false;
    });
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({ wrangler: true, port: '4000' })).rejects.toThrow(/process.exit/);
  });

  it('should handle --no-watch in development mode', async () => {
    const command = StartCommand.create();
    process.argv.push('--no-watch');
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('bootstrap.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should resolve port from APP_PORT env', async () => {
    const command = StartCommand.create();
    process.env['APP_PORT'] = '5000';
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should resolve mode from APP_MODE env', async () => {
    const command = StartCommand.create();
    process.env['APP_MODE'] = 'production';
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('bootstrap.js')) return true;
      return false;
    });
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should handle framework repo mode', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('bootstrap.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: '@zintrust/core' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should fallback to src/index.ts if bootstrap is missing', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('src/index.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should use dev script if available and safe', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        name: 'my-app',
        scripts: { dev: 'custom-dev-command' },
      })
    );
    vi.mocked(resolveNpmPath).mockReturnValue('npm');
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should throw if dev script calls zin', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        name: 'my-app',
        scripts: { dev: 'zin start' },
      })
    );

    await expect(command.execute({})).rejects.toThrow(/No entry point found/);
  });

  it('should return undefined if APP_PORT is empty', async () => {
    const command = StartCommand.create();
    process.env['APP_PORT'] = '';
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should handle readFileSync error in readPackageJson', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    await expect(command.execute({})).rejects.toThrow(/Failed to read package.json/);
  });

  it('should normalize various mode inputs', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('bootstrap.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);
    await expect(command.execute({ mode: 'dev' })).rejects.toThrow(/process.exit/);

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('bootstrap.js')) return true;
      return false;
    });
    await expect(command.execute({ mode: 'prod' })).rejects.toThrow(/process.exit/);
  });

  it('should return undefined if PORT is empty', async () => {
    const command = StartCommand.create();
    Reflect.deleteProperty(process.env, 'APP_PORT');
    process.env['PORT'] = '';
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should throw error for invalid APP_PORT env', async () => {
    const command = StartCommand.create();
    process.env['APP_PORT'] = 'invalid';
    await expect(command.execute({})).rejects.toThrow(/Invalid APP_PORT\/PORT/);
  });

  it('should handle non-zero exit code in development mode', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(1);

    await expect(command.execute({})).rejects.toThrow('process.exit: 1');
  });

  it('should reach return after wrangler start (coverage)', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });

    await command.execute({ wrangler: true });

    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('should handle options.watch as boolean', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({ watch: true })).rejects.toThrow(/process.exit/);
    await expect(command.execute({ watch: false })).rejects.toThrow(/process.exit/);
  });

  it('should fallback to src/index.ts when watch is disabled and bootstrap is missing', async () => {
    const command = StartCommand.create();
    process.argv.push('--no-watch');
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('src/index.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['src/index.ts'],
      })
    );
  });

  it('should handle --watch flag', async () => {
    const command = StartCommand.create();
    process.argv.push('--watch');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);
    await expect(command.execute({})).rejects.toThrow(/process.exit/);
  });

  it('should handle missing scripts in package.json', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'my-app' }));
    // No scripts property
    await expect(command.execute({})).rejects.toThrow(/No entry point found/);
  });

  it('should use src/index.ts if bootstrap is missing in framework repo', async () => {
    const command = StartCommand.create();
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.toString().endsWith('package.json')) return true;
      if (p.toString().endsWith('src/index.ts')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: '@zintrust/core' }));
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await expect(command.execute({})).rejects.toThrow(/process.exit/);
    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['watch', 'src/index.ts'],
      })
    );
  });
});
