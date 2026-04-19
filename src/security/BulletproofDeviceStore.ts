import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { useDatabase } from '@orm/Database';

export type BulletproofDeviceRecord = Readonly<{
  userId?: string;
  deviceId: string;
  signingSecret: string;
  userAgent?: string;
  lastSeenAt: Date;
}>;

export type StoredBulletproofDeviceRecord = BulletproofDeviceRecord &
  Readonly<{
    createdAt?: Date;
    updatedAt?: Date;
  }>;

const DEFAULTS = Object.freeze({
  dbConnection: 'default',
  dbTable: 'zintrust_bulletproof_devices',
});

const getConnection = (): string => {
  const value = Env.get('BULLETPROOF_DEVICE_DB_CONNECTION', DEFAULTS.dbConnection).trim();
  return value === '' ? DEFAULTS.dbConnection : value;
};

const getTable = (): string => {
  const value = Env.get('BULLETPROOF_DEVICE_DB_TABLE', DEFAULTS.dbTable).trim();
  return value === '' ? DEFAULTS.dbTable : value;
};

const normalizeString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const normalizeDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  return undefined;
};

const createMissingTableError = (table: string, error: unknown): Error => {
  return ErrorFactory.createConfigError(
    `Bulletproof device store table '${table}' is missing required columns (run migrations)`,
    {
      table,
      error: error instanceof Error ? error.message : String(error),
    }
  );
};

const toStoredRecord = (row: Record<string, unknown>): StoredBulletproofDeviceRecord | null => {
  const deviceId = normalizeString(row['device_id']);
  const signingSecret = normalizeString(row['signing_secret']);
  const lastSeenAt = normalizeDate(row['last_seen_at']);

  if (deviceId === undefined || signingSecret === undefined || lastSeenAt === undefined) {
    return null;
  }

  return {
    deviceId,
    signingSecret,
    lastSeenAt,
    ...(normalizeString(row['user_id']) === undefined
      ? {}
      : { userId: normalizeString(row['user_id']) }),
    ...(normalizeString(row['user_agent']) === undefined
      ? {}
      : { userAgent: normalizeString(row['user_agent']) }),
    ...(normalizeDate(row['created_at']) === undefined
      ? {}
      : { createdAt: normalizeDate(row['created_at']) }),
    ...(normalizeDate(row['updated_at']) === undefined
      ? {}
      : { updatedAt: normalizeDate(row['updated_at']) }),
  };
};

const toPayload = (record: BulletproofDeviceRecord): Record<string, unknown> => {
  const lastSeenAt = record.lastSeenAt.toISOString();

  return {
    user_id: normalizeString(record.userId) ?? null,
    device_id: record.deviceId,
    signing_secret: record.signingSecret,
    user_agent: normalizeString(record.userAgent) ?? null,
    last_seen_at: lastSeenAt,
    created_at: lastSeenAt,
    updated_at: lastSeenAt,
  };
};

export const BulletproofDeviceStore = Object.freeze({
  async findByDeviceId(deviceId: string): Promise<StoredBulletproofDeviceRecord | null> {
    if (!isNonEmptyString(deviceId)) return null;

    const db = useDatabase(undefined, getConnection());
    const table = getTable();

    try {
      const row = await db
        .table(table)
        .where('device_id', '=', deviceId.trim())
        .first<Record<string, unknown>>();
      return row === null ? null : toStoredRecord(row);
    } catch (error) {
      throw createMissingTableError(table, error);
    }
  },

  async upsert(record: BulletproofDeviceRecord): Promise<StoredBulletproofDeviceRecord> {
    const db = useDatabase(undefined, getConnection());
    const table = getTable();
    const payload = toPayload(record);

    try {
      await db.table(table).where('device_id', '=', record.deviceId).update(payload);
      const existing = await db
        .table(table)
        .where('device_id', '=', record.deviceId)
        .first<Record<string, unknown>>();

      if (existing === null) {
        await db.table(table).insert(payload);
      }

      const stored = await db
        .table(table)
        .where('device_id', '=', record.deviceId)
        .first<Record<string, unknown>>();
      const normalized = stored === null ? null : toStoredRecord(stored);

      if (normalized === null) {
        throw ErrorFactory.createConfigError(
          'Bulletproof device store returned an invalid record',
          {
            table,
            deviceId: record.deviceId,
          }
        );
      }

      return normalized;
    } catch (error) {
      throw createMissingTableError(table, error);
    }
  },

  async removeByDeviceId(deviceId: string): Promise<void> {
    if (!isNonEmptyString(deviceId)) return;

    const db = useDatabase(undefined, getConnection());
    const table = getTable();

    try {
      await db.table(table).where('device_id', '=', deviceId.trim()).delete();
    } catch (error) {
      throw createMissingTableError(table, error);
    }
  },
});

export default BulletproofDeviceStore;
