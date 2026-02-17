import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => fsMocks);

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mergeMock = vi.fn();
const fromJsonlMock = vi.fn();
const toStatementsJsonMock = vi.fn();

vi.mock('@orm/SchemaStatemenWriter', () => ({
  StatementRegistryBuild: {
    merge: (...args: unknown[]) => mergeMock(...args),
    fromJsonl: (...args: unknown[]) => fromJsonlMock(...args),
    toStatementsJson: (...args: unknown[]) => toStatementsJsonMock(...args),
  },
}));

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { D1LearnCommand } from '@cli/commands/D1LearnCommand';

describe('D1LearnCommand (coverage extras)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mergeMock.mockReset();
    fromJsonlMock.mockReset();
    toStatementsJsonMock.mockReset();

    fsMocks.rm.mockResolvedValue(undefined);
    fsMocks.writeFile.mockResolvedValue(undefined);
    toStatementsJsonMock.mockReturnValue('{"queries":{}}');

    spawnMock.mockImplementation(() => {
      return {
        on: (event: string, cb: (...args: unknown[]) => void) => {
          if (event === 'close') cb(0);
          return undefined;
        },
      };
    });
  });

  it('append mode reads existing registry JSON directly (not wrapped in queries) and merges', async () => {
    // Learned file -> 1 query
    fsMocks.readFile.mockImplementation(async (file: string) => {
      if (file === 'storage/d1-learned.jsonl') return 'jsonl';
      // existing output file
      return JSON.stringify({ A: 'SELECT 1', B: '' });
    });
    fromJsonlMock.mockReturnValue({ C: 'SELECT 2' });
    fsMocks.stat.mockResolvedValue(undefined);
    mergeMock.mockImplementation(
      (existing: Record<string, string>, learned: Record<string, string>) => ({
        ...existing,
        ...learned,
      })
    );

    const cmd = D1LearnCommand.create();
    await cmd.execute({ args: ['echo hi'], output: 'out.json', append: true });

    expect(mergeMock).toHaveBeenCalledWith({ A: 'SELECT 1' }, { C: 'SELECT 2' });
    expect(fsMocks.writeFile).toHaveBeenCalled();
  });

  it('readExistingRegistryFile returns {} when stat/read fails (catch branch)', async () => {
    fsMocks.stat.mockRejectedValue(new Error('no file'));
    fsMocks.readFile.mockImplementation(async (file: string) => {
      if (file === 'storage/d1-learned.jsonl') return 'jsonl';
      throw new Error('should not read existing');
    });
    fromJsonlMock.mockReturnValue({ C: 'SELECT 2' });
    mergeMock.mockImplementation(
      (existing: Record<string, string>, learned: Record<string, string>) => ({
        ...existing,
        ...learned,
      })
    );

    const cmd = D1LearnCommand.create();
    await cmd.execute({ args: ['echo hi'], output: 'out.json', append: true });

    expect(mergeMock).toHaveBeenCalledWith({}, { C: 'SELECT 2' });
  });

  it('rethrows parseLearnedFile errors when not ENOENT', async () => {
    fsMocks.readFile.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));

    const cmd = D1LearnCommand.create();
    await expect(cmd.execute({ args: ['echo hi'] })).rejects.toBeDefined();
  });
});
