import { ErrorFactory } from '@exceptions/ZintrustError';

import type {
  Blueprint,
  ColumnBuilder,
  ColumnDefinition,
  ColumnType,
  ForeignKeyAction,
  ForeignKeyBuilder,
  ForeignKeyDefinition,
  IndexDefinition,
  TableDefinition,
} from '@/migrations/schema/types';

const IDENT_RE = /^[A-Za-z_]\w*$/;

function assertIdentifier(label: string, value: string): void {
  if (!IDENT_RE.test(value)) {
    throw ErrorFactory.createValidationError(`Invalid ${label} identifier: ${value}`);
  }
}

function createColumnBuilder(def: ColumnDefinition): ColumnBuilder {
  const builder: ColumnBuilder = {
    nullable(): ColumnBuilder {
      def.nullable = true;
      return builder;
    },
    notNullable(): ColumnBuilder {
      def.nullable = false;
      return builder;
    },
    default(value: unknown): ColumnBuilder {
      def.defaultValue = value;
      return builder;
    },
    unique(): ColumnBuilder {
      def.unique = true;
      return builder;
    },
    primary(): ColumnBuilder {
      def.primary = true;
      def.nullable = false;
      return builder;
    },
    autoIncrement(): ColumnBuilder {
      def.autoIncrement = true;
      def.primary = true;
      def.nullable = false;
      return builder;
    },
    unsigned(): ColumnBuilder {
      def.unsigned = true;
      return builder;
    },
    getDefinition(): ColumnDefinition {
      return { ...def };
    },
  };

  return builder;
}

function createForeignKeyBuilder(columns: string[], name?: string): ForeignKeyBuilder {
  for (const c of columns) assertIdentifier('column', c);

  const fk: Partial<ForeignKeyDefinition> = {
    name: name ?? `fk_${columns.join('_')}`,
    columns,
  };

  const builder: ForeignKeyBuilder = {
    references(cols: string | string[]): ForeignKeyBuilder {
      const arr = Array.isArray(cols) ? cols : [cols];
      for (const c of arr) assertIdentifier('referenced column', c);
      fk.referencedColumns = arr;
      return builder;
    },
    on(table: string): ForeignKeyBuilder {
      assertIdentifier('referenced table', table);
      fk.referencedTable = table;
      return builder;
    },
    onDelete(action: ForeignKeyAction): ForeignKeyBuilder {
      fk.onDelete = action;
      return builder;
    },
    onUpdate(action: ForeignKeyAction): ForeignKeyBuilder {
      fk.onUpdate = action;
      return builder;
    },
    getDefinition(): ForeignKeyDefinition {
      if (typeof fk.referencedTable !== 'string' || fk.referencedTable.length === 0) {
        throw ErrorFactory.createValidationError('Foreign key missing referenced table');
      }
      if (!Array.isArray(fk.referencedColumns) || fk.referencedColumns.length === 0) {
        throw ErrorFactory.createValidationError('Foreign key missing referenced columns');
      }
      return fk as ForeignKeyDefinition;
    },
  };

  return builder;
}

type BlueprintState = {
  tableName: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  dropColumns: string[];
  dropIndexes: string[];
  dropForeignKeys: string[];
  pendingForeignKeys: ForeignKeyBuilder[];
};

function createState(tableName: string): BlueprintState {
  return {
    tableName,
    columns: [],
    indexes: [],
    foreignKeys: [],
    dropColumns: [],
    dropIndexes: [],
    dropForeignKeys: [],
    pendingForeignKeys: [],
  };
}

function addColumn(
  state: BlueprintState,
  name: string,
  type: ColumnType,
  length?: number
): ColumnBuilder {
  assertIdentifier('column', name);
  const def: ColumnDefinition = {
    name,
    type,
    length,
    nullable: false,
    defaultValue: undefined,
    primary: false,
    unique: false,
    autoIncrement: false,
    unsigned: false,
  };

  const builder = createColumnBuilder(def);
  state.columns.push(def);
  return builder;
}

function buildDefinition(state: BlueprintState): TableDefinition {
  for (const fk of state.pendingForeignKeys) state.foreignKeys.push(fk.getDefinition());

  return {
    name: state.tableName,
    columns: [...state.columns],
    indexes: [...state.indexes],
    foreignKeys: [...state.foreignKeys],
  };
}

function createBlueprintApi(state: BlueprintState): Blueprint {
  const api: Blueprint = {
    string: (name, length = 255) => addColumn(state, name, 'STRING', length),
    integer: (name) => addColumn(state, name, 'INTEGER'),
    bigInteger: (name) => addColumn(state, name, 'INTEGER').unsigned(),
    real: (name) => addColumn(state, name, 'REAL'),
    boolean: (name) => addColumn(state, name, 'BOOLEAN'),
    text: (name) => addColumn(state, name, 'TEXT'),
    json: (name) => addColumn(state, name, 'JSON'),
    timestamp: (name) => addColumn(state, name, 'TIMESTAMP'),
    blob: (name) => addColumn(state, name, 'BLOB'),

    id: (name = 'id') => addColumn(state, name, 'INTEGER').primary().autoIncrement(),

    timestamps: (createdAt = 'created_at', updatedAt = 'updated_at') => {
      api.timestamp(createdAt).notNullable().default('CURRENT_TIMESTAMP');
      api.timestamp(updatedAt).notNullable().default('CURRENT_TIMESTAMP');
    },

    index: (cols, name) => {
      const arr = Array.isArray(cols) ? cols : [cols];
      for (const c of arr) assertIdentifier('column', c);
      const indexName = name ?? `idx_${state.tableName}_${arr.join('_')}`;
      assertIdentifier('index', indexName);
      state.indexes.push({ name: indexName, columns: arr, type: 'INDEX' });
    },

    unique: (cols, name) => {
      const arr = Array.isArray(cols) ? cols : [cols];
      for (const c of arr) assertIdentifier('column', c);
      const indexName = name ?? `uniq_${state.tableName}_${arr.join('_')}`;
      assertIdentifier('index', indexName);
      state.indexes.push({ name: indexName, columns: arr, type: 'UNIQUE' });
    },

    foreign: (cols, name) => {
      const arr = Array.isArray(cols) ? cols : [cols];
      const builder = createForeignKeyBuilder(arr, name);
      state.pendingForeignKeys.push(builder);
      return builder;
    },

    dropColumn: (name) => {
      assertIdentifier('column', name);
      state.dropColumns.push(name);
    },

    dropIndex: (name) => {
      assertIdentifier('index', name);
      state.dropIndexes.push(name);
    },

    dropForeign: (name) => {
      assertIdentifier('foreign key', name);
      state.dropForeignKeys.push(name);
    },

    getDefinition: () => buildDefinition(state),
    getDropColumns: () => [...state.dropColumns],
    getDropIndexes: () => [...state.dropIndexes],
    getDropForeignKeys: () => [...state.dropForeignKeys],
  };

  return api;
}

export const MigrationBlueprint = Object.freeze({
  create(tableName: string): Blueprint {
    assertIdentifier('table', tableName);

    const state = createState(tableName);
    return createBlueprintApi(state);
  },
});
