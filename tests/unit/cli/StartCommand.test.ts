import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    handle: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

type SpawnAndWait = (input: import('@cli/utils/spawn').SpawnAndWaitInput) => Promise<number>;

const spawnAndWait = vi.fn<SpawnAndWait>();

vi.mock('@cli/utils/spawn', async () => {
  const actual = await vi.importActual<typeof import('@cli/utils/spawn')>('@cli/utils/spawn');
  return {
    ...actual,
    SpawnUtil: {
      spawnAndWait,
    },
  };
});

const existsSync = vi.fn();
const readFileSync = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync,
    readFileSync,
  };
});

let StartCommand: typeof import('@cli/commands/StartCommand').StartCommand;
let ErrorHandler: typeof import('@cli/ErrorHandler').ErrorHandler;

const setArgv = (argv: string[]): void => {
  process.argv = argv;
};

beforeAll(async () => {
  process.env['JWT_SECRET'] ??= 'test-jwt-secret';
  ({ StartCommand } = await import('@cli/commands/StartCommand'));
  ({ ErrorHandler } = await import('@cli/ErrorHandler'));
});

beforeEach(() => {
  vi.clearAllMocks();
  setArgv(['node', 'zin', 'start']);
});

describe('StartCommand', () => {
  it('registers as start command', () => {
    const cmd = StartCommand.create();
    expect(cmd.name).toBe('start');
  });

  it('errors if both --watch and --no-watch are provided', async () => {
    setArgv(['node', 'zin', 'start', '--watch', '--no-watch']);
    const cmd = StartCommand.create().getCommand();

    await cmd.parseAsync(['--watch', '--no-watch'], { from: 'user' });

    expect(ErrorHandler.handle).toHaveBeenCalled();
  });

  it('errors in testing mode', async () => {
    const cmd = StartCommand.create().getCommand();

    await cmd.parseAsync(['--mode', 'testing'], { from: 'user' });

    expect(ErrorHandler.handle).toHaveBeenCalled();
  });

  it('errors in production mode when dist bootstrap is missing', async () => {
    existsSync.mockReturnValue(false);
    const cmd = StartCommand.create().getCommand();

    await cmd.parseAsync(['--mode', 'production'], { from: 'user' });

    expect(ErrorHandler.handle).toHaveBeenCalled();
  });

  it('starts wrangler dev when --wrangler is provided and config exists', async () => {
    existsSync.mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.endsWith('wrangler.toml')) return true;
      return false;
    });

    spawnAndWait.mockResolvedValue(0);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const cmd = StartCommand.create().getCommand();

    await cmd.parseAsync(['--wrangler'], { from: 'user' });

    expect(spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'wrangler', args: ['dev'] })
    );
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it('starts tsx watch src/boot/bootstrap.ts in framework repo development mode', async () => {
    existsSync.mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.endsWith('package.json')) return true;
      if (typeof p === 'string' && p.endsWith('src/boot/bootstrap.ts')) return true;
      return false;
    });

    readFileSync.mockReturnValue(JSON.stringify({ name: 'zintrust', scripts: {} }));
    spawnAndWait.mockResolvedValue(0);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const cmd = StartCommand.create().getCommand();

    await cmd.parseAsync([], { from: 'user' });

    expect(spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'tsx', args: ['watch', 'src/boot/bootstrap.ts'] })
    );
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});
