import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import type { IDatabase } from '@orm/Database';
import { useDatabase } from '@orm/Database';
import {
  shouldRetryAuthStoreInsertWithGeneratedId,
  withGeneratedAuthStoreId,
} from '@security/AuthStoreIds';

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

const normalizeRequiredDeviceId = (value: unknown): string => {
  const normalized = normalizeString(value);
  if (normalized !== undefined) return normalized;

  throw ErrorFactory.createValidationError(
    'Bulletproof device store requires a non-empty deviceId'
  );
};

const normalizeRequiredSigningSecret = (value: unknown): string => {
  const normalized = normalizeString(value);
  if (normalized !== undefined) return normalized;

  throw ErrorFactory.createValidationError(
    'Bulletproof device store requires a non-empty signingSecret'
  );
};

const normalizeDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  return undefined;
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const isSchemaError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('no such table') ||
    message.includes('no such column') ||
    message.includes('unknown column') ||
    message.includes('does not exist') ||
    message.includes('undefined column') ||
    message.includes('missing column')
  );
};

const createStoreError = (
  table: string,
  operation: string,
  error: unknown,
  details?: Record<string, unknown>
): Error => {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code === 'CONFIG_ERROR') {
      return error as Error;
    }
  }

  const message = getErrorMessage(error);
  const detailPayload = { table, operation, error: message, ...details };

  if (isSchemaError(error)) {
    return ErrorFactory.createConfigError(
      `Bulletproof device store table '${table}' is missing required columns (run migrations)`,
      detailPayload
    );
  }

  return ErrorFactory.createDatabaseError(
    `Bulletproof device store ${operation} failed`,
    detailPayload
  );
};

const createInvalidStoredRecordError = (table: string, deviceId?: string): Error => {
  return ErrorFactory.createConfigError('Bulletproof device store returned an invalid record', {
    table,
    ...(deviceId === undefined ? {} : { deviceId }),
  });
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

const buildInsertPayload = (record: BulletproofDeviceRecord): Record<string, unknown> => {
  const lastSeenAt = record.lastSeenAt.toISOString();
  const deviceId = normalizeRequiredDeviceId(record.deviceId);
  const signingSecret = normalizeRequiredSigningSecret(record.signingSecret);

  return {
    user_id: normalizeString(record.userId) ?? null,
    device_id: deviceId,
    signing_secret: signingSecret,
    user_agent: normalizeString(record.userAgent) ?? null,
    last_seen_at: lastSeenAt,
    created_at: lastSeenAt,
    updated_at: lastSeenAt,
  };
};

const buildUpdatePayload = (record: BulletproofDeviceRecord): Record<string, unknown> => {
  const lastSeenAt = record.lastSeenAt.toISOString();
  const signingSecret = normalizeRequiredSigningSecret(record.signingSecret);

  return {
    user_id: normalizeString(record.userId) ?? null,
    signing_secret: signingSecret,
    user_agent: normalizeString(record.userAgent) ?? null,
    last_seen_at: lastSeenAt,
    updated_at: lastSeenAt,
  };
};

const buildIgnoreInsert = (
  db: IDatabase,
  table: string,
  columns: string[],
  conflictColumns: string[]
): string => {
  const columnList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const driver = db.getType();

  if (driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote') {
    return `INSERT OR IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`;
  }

  if (driver === 'mysql') {
    return `INSERT IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`;
  }

  if (driver === 'postgresql') {
    return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`;
  }

  if (driver === 'sqlserver') {
    const sourceColumns = columns.map((_, index) => `v${index + 1}`);
    const selectClause = sourceColumns.map((name) => `? AS ${name}`).join(', ');
    const conflictClause = conflictColumns
      .map((column) => `target.${column} = source.${column}`)
      .join(' AND ');
    const insertValues = columns.map((column) => `source.${column}`).join(', ');
    const sourceProjection = columns
      .map((column, index) => `${sourceColumns[index]} AS ${column}`)
      .join(', ');

    return [
      `MERGE INTO ${table} WITH (HOLDLOCK) AS target`,
      `USING (SELECT ${sourceProjection} FROM (SELECT ${selectClause}) seed) AS source`,
      `ON ${conflictClause}`,
      `WHEN NOT MATCHED THEN INSERT (${columnList}) VALUES (${insertValues});`,
    ].join(' ');
  }

  return `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`;
};

const isDuplicateInsertError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('duplicate') ||
    message.includes('unique constraint') ||
    message.includes('unique failed') ||
    message.includes('duplicate key')
  );
};

export const BulletproofDeviceStore = Object.freeze({
  async findByDeviceId(deviceId: string): Promise<StoredBulletproofDeviceRecord | null> {
    if (!isNonEmptyString(deviceId)) return null;

    const db = useDatabase(undefined, getConnection());
    const table = getTable();
    const normalizedDeviceId = deviceId.trim();

    try {
      const row = await db
        .table(table)
        .where('device_id', '=', normalizedDeviceId)
        .first<Record<string, unknown>>();

      if (row === null) {
        return null;
      }

      const normalized = toStoredRecord(row);
      if (normalized === null) {
        throw createInvalidStoredRecordError(table, normalizedDeviceId);
      }

      return normalized;
    } catch (error) {
      throw createStoreError(table, 'lookup', error, { deviceId: normalizedDeviceId });
    }
  },

  async upsert(record: BulletproofDeviceRecord): Promise<StoredBulletproofDeviceRecord> {
    const db = useDatabase(undefined, getConnection());
    const table = getTable();
    const deviceId = normalizeRequiredDeviceId(record.deviceId);
    const normalizedUserId = normalizeString(record.userId);
    const normalizedUserAgent = normalizeString(record.userAgent);
    const normalizedRecord: BulletproofDeviceRecord = {
      ...record,
      deviceId,
      signingSecret: normalizeRequiredSigningSecret(record.signingSecret),
      ...(normalizedUserId === undefined ? {} : { userId: normalizedUserId }),
      ...(normalizedUserAgent === undefined ? {} : { userAgent: normalizedUserAgent }),
    };
    const insertPayload = buildInsertPayload(normalizedRecord);
    const updatePayload = buildUpdatePayload(normalizedRecord);

    try {
      return await db.transaction(async (transactionDb) => {
        await transactionDb.table(table).where('device_id', '=', deviceId).update(updatePayload);

        const insertRecord = async (payload: Record<string, unknown>): Promise<void> => {
          const columns = Object.keys(payload);
          const values = columns.map((column) => payload[column]);
          const sql = buildIgnoreInsert(db, table, columns, ['device_id']);
          await transactionDb.execute(sql, values);
        };

        try {
          await insertRecord(insertPayload);
        } catch (error) {
          if (!isDuplicateInsertError(error)) {
            if (!shouldRetryAuthStoreInsertWithGeneratedId(error)) {
              throw error;
            }

            try {
              await insertRecord(withGeneratedAuthStoreId(insertPayload));
            } catch (retryError) {
              if (!isDuplicateInsertError(retryError)) {
                throw retryError;
              }
            }
          }
        }

        const stored = await transactionDb
          .table(table)
          .where('device_id', '=', deviceId)
          .first<Record<string, unknown>>();
        const normalized = stored === null ? null : toStoredRecord(stored);

        if (normalized === null) {
          throw createInvalidStoredRecordError(table, deviceId);
        }

        return normalized;
      });
    } catch (error) {
      throw createStoreError(table, 'upsert', error, { deviceId });
    }
  },

  async removeByDeviceId(deviceId: string): Promise<void> {
    if (!isNonEmptyString(deviceId)) return;

    const db = useDatabase(undefined, getConnection());
    const table = getTable();
    const normalizedDeviceId = deviceId.trim();

    try {
      await db.table(table).where('device_id', '=', normalizedDeviceId).delete();
    } catch (error) {
      throw createStoreError(table, 'delete', error, { deviceId: normalizedDeviceId });
    }
  },
});

export default BulletproofDeviceStore;
