import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const hasTable = vi.fn();
  const hasColumn = vi.fn();
  const text = vi.fn();
  const nullable = vi.fn();
  const dropColumn = vi.fn();
  const table = vi.fn(async (_name: string, cb: (bp: unknown) => void) => {
    cb({ text, dropColumn });
  });
  text.mockReturnValue({ nullable });
  const db = { getType: vi.fn(() => 'sqlite'), query: vi.fn() };
  return { hasTable, hasColumn, table, text, nullable, dropColumn, db };
});
const { hasTable, hasColumn, table, text, nullable, dropColumn, db: mockDb } = mocks;

vi.mock('@zintrust/core/database', () => ({
  MigrationSchema: {
    create: vi.fn(() => ({
      hasTable: mocks.hasTable,
      hasColumn: mocks.hasColumn,
      table: mocks.table,
    })),
  },
}));

import { migration } from '../../migrations/20260412120000_add_zin_trace_entries_summary_column';

describe('AddZinTraceEntriesSummaryColumn migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getType.mockReturnValue('sqlite');
    text.mockReturnValue({ nullable });
    hasTable.mockResolvedValue(true);
    hasColumn.mockResolvedValue(false);
  });

  it('adds a nullable summary text column when it is missing', async () => {
    await migration.up(mockDb as never);

    expect(table).toHaveBeenCalledWith('zin_trace_entries', expect.any(Function));
    expect(text).toHaveBeenCalledWith('summary');
    expect(nullable).toHaveBeenCalled();
  });

  it('skips when the summary column already exists', async () => {
    hasColumn.mockResolvedValue(true);

    await migration.up(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });

  it('skips when the entries table does not exist yet', async () => {
    hasTable.mockResolvedValue(false);

    await migration.up(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });

  it('drops the summary column on down when it exists', async () => {
    mockDb.getType.mockReturnValue('mysql');
    hasColumn.mockResolvedValue(true);

    await migration.down(mockDb as never);

    expect(dropColumn).toHaveBeenCalledWith('summary');
  });

  it('keeps the nullable column on down for sqlite since the schema builder cannot drop columns there', async () => {
    hasColumn.mockResolvedValue(true);

    await migration.down(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });

  it('does nothing on down when the summary column is absent', async () => {
    await migration.down(mockDb as never);

    expect(table).not.toHaveBeenCalled();
  });
});
