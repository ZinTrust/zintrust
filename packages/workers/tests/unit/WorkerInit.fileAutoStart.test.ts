import { describe, expect, it, vi } from 'vitest';

import {
  buildFileBackedAutoStartTasks,
  selectAutoStartNames,
  selectAutoStartTasks,
} from '../../src/WorkerInit';

describe('WorkerInit file-backed auto-start selection', () => {
  it('uses file-backed auto-start tasks when persisted candidates are empty', () => {
    const tasks = selectAutoStartTasks(
      [],
      [{ name: 'digest-worker', autoStart: true, activeStatus: true }],
      vi.fn()
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.name).toBe('digest-worker');
    expect(tasks[0]?.source).toBe('file');
    expect(tasks[0]?.persistenceOverride).toEqual({ driver: 'memory' });
  });

  it('keeps persisted candidates and skips file-backed fallback when present', () => {
    const persistedTasks = [
      {
        name: 'persisted-worker',
        autoStart: true,
        activeStatus: true,
        persistenceOverride: { driver: 'memory' as const },
        source: 'memory' as const,
      },
    ];

    const tasks = selectAutoStartTasks(
      persistedTasks,
      [{ name: 'digest-worker', autoStart: true, activeStatus: true }],
      vi.fn()
    );

    expect(tasks).toEqual(persistedTasks);
  });

  it('returns persisted names before file-backed names', () => {
    const result = selectAutoStartNames(
      [{ name: 'persisted-worker', autoStart: true, activeStatus: true }],
      [{ name: 'file-worker', autoStart: true, activeStatus: true }],
      vi.fn()
    );

    expect(result).toEqual({ names: ['persisted-worker'], source: 'persisted' });
  });

  it('filters out inactive file-backed workers', () => {
    const tasks = buildFileBackedAutoStartTasks(
      [{ name: 'inactive-worker', autoStart: true, activeStatus: false }],
      vi.fn()
    );

    expect(tasks).toEqual([]);
  });

  it('deduplicates file-backed worker names', () => {
    const warn = vi.fn();
    const tasks = buildFileBackedAutoStartTasks(
      [
        { name: 'digest-worker', autoStart: true, activeStatus: true },
        { name: 'digest-worker', autoStart: true, activeStatus: true },
      ],
      warn
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.name).toBe('digest-worker');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('appears multiple times in file-backed discovery')
    );
  });

  it('returns file-backed names when persisted candidates are absent', () => {
    const warn = vi.fn();
    const result = selectAutoStartNames(
      [],
      [
        { name: 'digest-worker', autoStart: true, activeStatus: true },
        { name: 'digest-worker', autoStart: true, activeStatus: true },
      ],
      warn
    );

    expect(result).toEqual({ names: ['digest-worker'], source: 'file' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
