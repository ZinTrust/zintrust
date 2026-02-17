import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  copyFileSyncMock: vi.fn(),
  readFileSyncMock: vi.fn().mockReturnValue('template'),
  writeFileSyncMock: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => mocks.existsSyncMock(...args),
  copyFileSync: (...args: unknown[]) => mocks.copyFileSyncMock(...args),
  readFileSync: (...args: unknown[]) => mocks.readFileSyncMock(...args),
  writeFileSync: (...args: unknown[]) => mocks.writeFileSyncMock(...args),
}));

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: {
    confirm: vi.fn(async () => true),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { InitEcosystemCommand } from '@cli/commands/InitEcosystemCommand';
import { Logger } from '@config/logger';

describe('InitEcosystemCommand (coverage extras)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSyncMock.mockReset();
    mocks.copyFileSyncMock.mockReset();
    mocks.readFileSyncMock.mockReset();
    mocks.writeFileSyncMock.mockReset();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    // Force overwrite + backup behavior.
    mocks.existsSyncMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('backs up existing files with timestamp suffix before writing', async () => {
    const cmd = InitEcosystemCommand.create();
    await cmd.execute({ args: [] });

    expect(mocks.copyFileSyncMock).toHaveBeenCalled();
    const backupArg = mocks.copyFileSyncMock.mock.calls[0]?.[1];
    expect(String(backupArg)).toContain('.bak.2026-01-01T00-00-00-000Z');

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('🗂️ Backup created:'));
    expect(mocks.writeFileSyncMock).toHaveBeenCalled();
  });
});
