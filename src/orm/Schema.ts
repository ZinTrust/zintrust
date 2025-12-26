/**
 * Schema - Column definition and type system
 * Defines database columns with type safety
 */

export type ColumnType =
  | 'string'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'text'
  | 'timestamp'
  | 'decimal'
  | 'uuid'
  | 'float'
  | 'double'
  | 'binary'
  | 'enum'
  | 'bigInteger'
  | 'smallInteger'
  | 'tinyInteger'
  | 'mediumInteger'
  | 'time'
  | 'year'
  | 'char'
  | 'longText'
  | 'mediumText'
  | 'tinyText'
  | 'blob'
  | 'mediumBlob'
  | 'longBlob'
  | 'tinyBlob'
  | 'ipAddress'
  | 'macAddress'
  | 'geometry'
  | 'point'
  | 'lineString'
  | 'polygon'
  | 'geometryCollection'
  | 'multiPoint'
  | 'multiLineString'
  | 'multiPolygon';

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  nullable: boolean;
  default?: unknown;
  unique: boolean;
  primary: boolean;
  index: boolean;
  autoIncrement?: boolean;
  unsigned?: boolean;
  comment?: string;
  references?: string;
  on?: string;
  onDelete?: string;
  onUpdate?: string;
  renameTo?: string;
  change?: boolean;
  drop?: boolean;
  after?: string;
  first?: boolean;
  charset?: string;
  collation?: string;
  length?: number;
  precision?: number;
  scale?: number;
  values?: string[];
}

export interface IColumn {
  nullable(): IColumn;
  default(value: unknown): IColumn;
  unique(): IColumn;
  primary(): IColumn;
  index(): IColumn;
  autoIncrement(): IColumn;
  unsigned(): IColumn;
  comment(text: string): IColumn;
  references(column: string): IColumn;
  on(table: string): IColumn;
  onDelete(action: string): IColumn;
  onUpdate(action: string): IColumn;
  renameTo(name: string): IColumn;
  change(): IColumn;
  drop(): IColumn;
  after(column: string): IColumn;
  first(): IColumn;
  charset(value: string): IColumn;
  collation(value: string): IColumn;
  length(value: number): IColumn;
  precision(value: number): IColumn;
  scale(value: number): IColumn;
  values(value: string[]): IColumn;
  getDefinition(): ColumnDefinition;
}

interface DefinitionBuilder {
  name: string;
  type: ColumnType;
  nullable: boolean;
  unique: boolean;
  primary: boolean;
  index: boolean;
}

const definitionBuilder = (name: string, type: ColumnType): DefinitionBuilder => {
  return {
    name,
    type,
    nullable: false,
    unique: false,
    primary: false,
    index: false,
  };
};

type ColumnBooleanKey =
  | 'nullable'
  | 'unique'
  | 'primary'
  | 'index'
  | 'autoIncrement'
  | 'unsigned'
  | 'change'
  | 'drop'
  | 'first';

const createColumnFromDefinition = (definition: ColumnDefinition): IColumn => {
  const column = {} as IColumn;

  const enable = <K extends ColumnBooleanKey>(key: K): (() => IColumn) => {
    return () => {
      definition[key] = true;
      return column;
    };
  };

  const assign = <K extends keyof ColumnDefinition>(
    key: K
  ): ((value: ColumnDefinition[K]) => IColumn) => {
    return (value: ColumnDefinition[K]) => {
      definition[key] = value;
      return column;
    };
  };

  column.nullable = enable('nullable');
  column.unique = enable('unique');
  column.primary = enable('primary');
  column.index = enable('index');
  column.autoIncrement = enable('autoIncrement');
  column.unsigned = enable('unsigned');
  column.change = enable('change');
  column.drop = enable('drop');
  column.first = enable('first');

  column.default = assign('default') as (value: unknown) => IColumn;
  column.comment = assign('comment') as (text: string) => IColumn;
  column.references = assign('references') as (column: string) => IColumn;
  column.on = assign('on') as (table: string) => IColumn;
  column.onDelete = assign('onDelete') as (action: string) => IColumn;
  column.onUpdate = assign('onUpdate') as (action: string) => IColumn;
  column.renameTo = assign('renameTo') as (name: string) => IColumn;
  column.after = assign('after') as (column: string) => IColumn;
  column.charset = assign('charset') as (value: string) => IColumn;
  column.collation = assign('collation') as (value: string) => IColumn;
  column.length = assign('length') as (value: number) => IColumn;
  column.precision = assign('precision') as (value: number) => IColumn;
  column.scale = assign('scale') as (value: number) => IColumn;
  column.values = assign('values') as (value: string[]) => IColumn;

  column.getDefinition = (): ColumnDefinition => ({ ...definition });

  return column;
};

/**
 * Column - Column definition builder
 * Sealed namespace object following Pattern 2
 *
 * @see FRAMEWORK_REFACTOR_FUNCTION_PATTERN.md for Pattern 2 details
 */
export const Column = Object.freeze({
  /**
   * Create a new column instance
   */
  create(name: string, type: ColumnType): IColumn {
    const definition: ColumnDefinition = definitionBuilder(name, type);
    return createColumnFromDefinition(definition);
  },
});

export interface ISchema {
  string(name: string, length?: number): IColumn;
  integer(name: string): IColumn;
  boolean(name: string): IColumn;
  date(name: string): IColumn;
  datetime(name: string): IColumn;
  json(name: string): IColumn;
  text(name: string): IColumn;
  timestamp(name: string): IColumn;
  decimal(name: string, precision?: number, scale?: number): IColumn;
  uuid(name: string): IColumn;
  float(name: string): IColumn;
  double(name: string): IColumn;
  binary(name: string): IColumn;
  enum(name: string, values: string[]): IColumn;
  bigInteger(name: string): IColumn;
  smallInteger(name: string): IColumn;
  tinyInteger(name: string): IColumn;
  mediumInteger(name: string): IColumn;
  time(name: string): IColumn;
  year(name: string): IColumn;
  char(name: string, length?: number): IColumn;
  longText(name: string): IColumn;
  mediumText(name: string): IColumn;
  tinyText(name: string): IColumn;
  blob(name: string): IColumn;
  mediumBlob(name: string): IColumn;
  longBlob(name: string): IColumn;
  tinyBlob(name: string): IColumn;
  ipAddress(name: string): IColumn;
  macAddress(name: string): IColumn;
  geometry(name: string): IColumn;
  point(name: string): IColumn;
  lineString(name: string): IColumn;
  polygon(name: string): IColumn;
  geometryCollection(name: string): IColumn;
  multiPoint(name: string): IColumn;
  multiLineString(name: string): IColumn;
  multiPolygon(name: string): IColumn;
  increments(name: string): IColumn;
  bigIncrements(name: string): IColumn;
  timestamps(): void;
  softDeletes(): void;
  getColumns(): Map<string, IColumn>;
  getTable(): string;
}

/**
 * Schema - Table definition builder
 * Refactored to Functional Object pattern
 */
/**
 * Create a column proxy to track definition updates
 */
const createColumnProxy = (
  name: string,
  type: ColumnType,
  columns: Map<string, IColumn>
): IColumn => {
  const column = Column.create(name, type);
  columns.set(name, column);

  return column;
};

type SimpleSchemaColumnType =
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'text'
  | 'timestamp'
  | 'uuid'
  | 'float'
  | 'double'
  | 'binary'
  | 'bigInteger'
  | 'smallInteger'
  | 'tinyInteger'
  | 'mediumInteger'
  | 'time'
  | 'year'
  | 'longText'
  | 'mediumText'
  | 'tinyText'
  | 'blob'
  | 'mediumBlob'
  | 'longBlob'
  | 'tinyBlob'
  | 'ipAddress'
  | 'macAddress'
  | 'geometry'
  | 'point'
  | 'lineString'
  | 'polygon'
  | 'geometryCollection'
  | 'multiPoint'
  | 'multiLineString'
  | 'multiPolygon';

const SIMPLE_SCHEMA_COLUMN_TYPES: readonly SimpleSchemaColumnType[] = [
  'integer',
  'boolean',
  'date',
  'datetime',
  'json',
  'text',
  'timestamp',
  'uuid',
  'float',
  'double',
  'binary',
  'bigInteger',
  'smallInteger',
  'tinyInteger',
  'mediumInteger',
  'time',
  'year',
  'longText',
  'mediumText',
  'tinyText',
  'blob',
  'mediumBlob',
  'longBlob',
  'tinyBlob',
  'ipAddress',
  'macAddress',
  'geometry',
  'point',
  'lineString',
  'polygon',
  'geometryCollection',
  'multiPoint',
  'multiLineString',
  'multiPolygon',
];

const setSchemaMethod = <K extends keyof ISchema>(
  target: Partial<ISchema>,
  key: K,
  fn: ISchema[K]
): void => {
  (target as Record<string, unknown>)[key as string] = fn as unknown;
};

export const Schema = Object.freeze({
  /**
   * Create a new schema instance
   */
  create(table: string): ISchema {
    const columns = new Map<string, IColumn>();

    const schema: Partial<ISchema> = {};

    setSchemaMethod(schema, 'string', (name: string, length?: number) => {
      const col = createColumnProxy(name, 'string', columns);
      if (length !== undefined) col.length(length);
      return col;
    });

    setSchemaMethod(schema, 'decimal', (name: string, precision?: number, scale?: number) => {
      const col = createColumnProxy(name, 'decimal', columns);
      if (precision !== undefined) col.precision(precision);
      if (scale !== undefined) col.scale(scale);
      return col;
    });

    setSchemaMethod(schema, 'enum', (name: string, values: string[]) => {
      const col = createColumnProxy(name, 'enum', columns);
      col.values(values);
      return col;
    });

    setSchemaMethod(schema, 'char', (name: string, length?: number) => {
      const col = createColumnProxy(name, 'char', columns);
      if (length !== undefined) col.length(length);
      return col;
    });

    for (const type of SIMPLE_SCHEMA_COLUMN_TYPES) {
      setSchemaMethod(schema, type, (name: string) => createColumnProxy(name, type, columns));
    }

    setSchemaMethod(schema, 'increments', (name: string) =>
      createColumnProxy(name, 'integer', columns).primary().autoIncrement()
    );

    setSchemaMethod(schema, 'bigIncrements', (name: string) =>
      createColumnProxy(name, 'bigInteger', columns).primary().autoIncrement()
    );

    setSchemaMethod(schema, 'timestamps', () => {
      createColumnProxy('created_at', 'timestamp', columns).nullable();
      createColumnProxy('updated_at', 'timestamp', columns).nullable();
    });

    setSchemaMethod(schema, 'softDeletes', () => {
      createColumnProxy('deleted_at', 'timestamp', columns).nullable();
    });

    setSchemaMethod(schema, 'getColumns', () => columns);
    setSchemaMethod(schema, 'getTable', () => table);

    return schema as ISchema;
  },
});
