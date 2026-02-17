import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  fs: {
    stat: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    writeFile: vi.fn(),
  },
  registry: {
    fromJsonl: vi.fn(),
    merge: vi.fn(),
    toStatementsJson: vi.fn(),
  },
  spawn: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({ Logger: mocked.logger }));

vi.mock('@node-singletons/fs', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    stat: (...args: any[]) => mocked.fs.stat(...args),
    readFile: (...args: any[]) => mocked.fs.readFile(...args),
    rm: (...args: any[]) => mocked.fs.rm(...args),
    writeFile: (...args: any[]) => mocked.fs.writeFile(...args),
  };
});

vi.mock('node:child_process', () => ({
  spawn: (...args: any[]) => mocked.spawn(...args),
}));

const spawnResultThatCloses = (exitCode: number) =>
  ({
    on: (event: string, cb: (arg: unknown) => void) => {
      if (event === 'close') cb(exitCode);
    },
  }) as any;

const spawnResultThatErrors = (error: Error) =>
  ({
    on: (event: string, cb: (arg: unknown) => void) => {
      if (event === 'error') cb(error);
    },
  }) as any;

vi.mock('@orm/SchemaStatemenWriter', () => ({
  StatementRegistryBuild: {
    fromJsonl: (...args: any[]) => mocked.registry.fromJsonl(...args),
    merge: (...args: any[]) => mocked.registry.merge(...args),
    toStatementsJson: (...args: any[]) => mocked.registry.toStatementsJson(...args),
  },
}));

describe('D1LearnCommand', () => {
  it('logs an error and returns when command argument is missing', async () => {
    const { D1LearnCommand } = await import('@cli/commands/D1LearnCommand');
    await D1LearnCommand.create().execute({ args: [] });
    expect(mocked.logger.error).toHaveBeenCalledWith('Missing command argument');
  });

  it('warns when no queries are captured (ENOENT learned file)', async () => {
    mocked.fs.rm.mockResolvedValueOnce(undefined);
    mocked.spawn.mockReturnValueOnce(spawnResultThatCloses(0));
    mocked.fs.readFile.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'ENOENT' }));

    const { D1LearnCommand } = await import('@cli/commands/D1LearnCommand');
    await D1LearnCommand.create().execute({ args: ['npm test'] });

    expect(mocked.logger.warn).toHaveBeenCalledWith('No D1 queries were captured.');
  });

  it('merges with existing registry when --append is used and writes output', async () => {
    mocked.fs.rm.mockResolvedValueOnce(undefined);
    mocked.spawn.mockReturnValueOnce(spawnResultThatCloses(1));

    mocked.fs.readFile
      .mockResolvedValueOnce('q1|SELECT 1\n') // learned jsonl
      .mockResolvedValueOnce(JSON.stringify({ queries: { q0: 'SELECT 0' } })); // existing output
    mocked.fs.stat.mockResolvedValueOnce(undefined);

    mocked.registry.fromJsonl.mockReturnValueOnce({ q1: 'SELECT 1' });
    mocked.registry.merge.mockReturnValueOnce({ q0: 'SELECT 0', q1: 'SELECT 1' });
    mocked.registry.toStatementsJson.mockReturnValueOnce('{"queries":{}}');

    const { D1LearnCommand } = await import('@cli/commands/D1LearnCommand');
    await D1LearnCommand.create().execute({ args: ['npm test'], append: true, output: 'out.json' });

    expect(mocked.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Command exited with code 1')
    );
    expect(mocked.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Captured 1 unique queries.')
    );
    expect(mocked.fs.writeFile).toHaveBeenCalledWith('out.json', '{"queries":{}}');
    expect(mocked.logger.info).toHaveBeenCalledWith('Registry written to out.json');
  });

  it('throws a CLI error when learner fails to start', async () => {
    mocked.fs.rm.mockResolvedValueOnce(undefined);
    mocked.spawn.mockReturnValueOnce(spawnResultThatErrors(new Error('spawn fail')));

    const { D1LearnCommand } = await import('@cli/commands/D1LearnCommand');
    await expect(D1LearnCommand.create().execute({ args: ['npm test'] })).rejects.toThrow(
      /Learner failed to start/i
    );
  });
});
