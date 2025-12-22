/**
 * Schema - Column definition and type system
 * Defines database columns with type safety
 */

export type ColumnType = 'string' | 'integer' | 'boolean' | 'date' | 'datetime' | 'json' | 'text';

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  nullable: boolean;
  default?: unknown;
  unique: boolean;
  primary: boolean;
  index: boolean;
}

export class Column {
  private readonly definition: ColumnDefinition;

  constructor(name: string, type: ColumnType) {
    this.definition = {
      name,
      type,
      nullable: false,
      unique: false,
      primary: false,
      index: false,
    };
  }

  /**
   * Make column nullable
   */
  public nullable(): this {
    this.definition.nullable = true;
    return this;
  }

  /**
   * Set default value
   */
  public default(value: unknown): this {
    this.definition.default = value;
    return this;
  }

  /**
   * Make column unique
   */
  public unique(): this {
    this.definition.unique = true;
    return this;
  }

  /**
   * Make column primary key
   */
  public primary(): this {
    this.definition.primary = true;
    return this;
  }

  /**
   * Add index to column
   */
  public index(): this {
    this.definition.index = true;
    return this;
  }

  /**
   * Get column definition
   */
  public getDefinition(): ColumnDefinition {
    return { ...this.definition };
  }
}

export class Schema {
  private readonly columns = new Map<string, ColumnDefinition>();
  private readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  /**
   * Define a string column
   */
  public string(name: string, _length: number = 255): Column {
    const column = new Column(name, 'string');
    this.columns.set(name, { ...column.getDefinition(), type: 'string' });
    return column;
  }

  /**
   * Define an integer column
   */
  public integer(name: string): Column {
    const column = new Column(name, 'integer');
    this.columns.set(name, column.getDefinition());
    return column;
  }

  /**
   * Define a boolean column
   */
  public boolean(name: string): Column {
    const column = new Column(name, 'boolean');
    this.columns.set(name, column.getDefinition());
    return column;
  }

  /**
   * Define a date column
   */
  public date(name: string): Column {
    const column = new Column(name, 'date');
    this.columns.set(name, column.getDefinition());
    return column;
  }

  /**
   * Define a datetime column
   */
  public datetime(name: string): Column {
    const column = new Column(name, 'datetime');
    this.columns.set(name, column.getDefinition());
    return column;
  }

  /**
   * Define a JSON column
   */
  public json(name: string): Column {
    const column = new Column(name, 'json');
    this.columns.set(name, column.getDefinition());
    return column;
  }

  /**
   * Define a text column
   */
  public text(name: string): Column {
    const column = new Column(name, 'text');
    this.columns.set(name, column.getDefinition());
    return column;
  }

  /**
   * Get all columns
   */
  public getColumns(): ColumnDefinition[] {
    return Array.from(this.columns.values());
  }

  /**
   * Get table name
   */
  public getTable(): string {
    return this.table;
  }
}
