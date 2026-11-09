import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const hasTable = vi.fn();
  const index = vi.fn();
  const dropIndex = vi.fn();
  const table = vi.fn(async (_name: string, cb: (bp: unknown) => void) => {
    cb({ index, dropIndex });
  });
  const db = { getType: vi.fn(() => 'sqlite'), query: vi.fn() };
  return { hasTable, table, dropIndex, index, db };
});
const { hasTable, table, dropIndex, index, db: mockDb } = mocks;

vi.mock('@zintrust/core/database', () => ({
  MigrationSchema: {
    create: vi.fn(() => ({ hasTable: mocks.hasTable, table: mocks.table })),
  },
}));

import { migration } from '../../migrations/20260412090000_add_zin_trace_entries_type_created_index';

const INDEX_NAME = 'idx_zin_trace_type_created_id';

describe('AddZinTraceEntriesTypeCreatedIndex migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getType.mockReturnValue('sqlite');
    hasTable.mockResolvedValue(true);
    mockDb.query.mockResolvedValue([]);
  });

  it('adds the composite (type, created_at, id) index when it is missing', async () => {
    await migration.up(mockDb as never);

    expect(table).toHaveBeenCalledWith('zin_trace_entries', expect.any(Function));
    expect(index).toHaveBeenCalledWith(['type', 'created_at', 'id'], INDEX_NAME);
  });

  it('skips when the index already exists', async () => {
    mockDb.query.mockResolvedValue([{ name: INDEX_NAME }]);

    await migration.up(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });

  it('skips when the entries table does not exist yet', async () => {
    hasTable.mockResolvedValue(false);

    await migration.up(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });

  it('drops the index on down when it exists', async () => {
    mockDb.query.mockResolvedValue([{ name: INDEX_NAME }]);

    await migration.down(mockDb as never);

    expect(dropIndex).toHaveBeenCalledWith(INDEX_NAME);
  });

  it('does nothing on down when the index is absent', async () => {
    await migration.down(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });

  it('uses DROP INDEX ... ON table for sqlserver on down', async () => {
    mockDb.getType.mockReturnValue('sqlserver');
    mockDb.query.mockResolvedValueOnce([{ name: INDEX_NAME }]);

    await migration.down(mockDb as never);

    expect(mockDb.query).toHaveBeenLastCalledWith(
      `DROP INDEX ${INDEX_NAME} ON zin_trace_entries`,
      []
    );
    expect(dropIndex).not.toHaveBeenCalled();
  });
});
