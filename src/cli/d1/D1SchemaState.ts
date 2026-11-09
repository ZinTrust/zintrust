type ColumnState = { name: string; type: string };
type TableState = { name: string; columns: ColumnState[] };
type ObjectState = { name: string; table: string };

export type SchemaState = {
  tables: Map<string, TableState>;
  indexes: Map<string, ObjectState>;
  triggers: Map<string, ObjectState>;
};

type Ident = { name: string; rest: string };
type Row = Record<string, unknown>;

const IDENT_PATTERN = /^("(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s*/;
const IF_NOT_EXISTS = /^IF\s+NOT\s+EXISTS\s+/i;
const IF_EXISTS = /^IF\s+EXISTS\s+/i;
const TABLE_CONSTRAINT = /^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i;
const COLUMN_KEYWORDS = new Set([
  'constraint',
  'primary',
  'not',
  'null',
  'unique',
  'check',
  'default',
  'collate',
  'references',
  'generated',
  'as',
]);
const QUOTE_CLOSERS = new Map<string, string>([
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['[', ']'],
]);

const keyOf = (name: string): string => name.toLowerCase();

const readIdent = (text: string): Ident | null => {
  const m = IDENT_PATTERN.exec(text);
  if (m === null) return null;
  const raw = m[1];
  const quoted = raw.startsWith('"') || raw.startsWith('`') || raw.startsWith('[');
  const name = quoted ? raw.slice(1, -1).replaceAll('""', '"') : raw;
  return { name, rest: text.slice(m[0].length) };
};

const skipPrefix = (text: string, pattern: RegExp): { matched: boolean; rest: string } => {
  const m = pattern.exec(text);
  return m === null
    ? { matched: false, rest: text }
    : { matched: true, rest: text.slice(m[0].length) };
};

const readParenBody = (text: string): string | null => {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open === -1 || close <= open) return null;
  return text.slice(open + 1, close);
};

const splitTopLevel = (body: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let closer: string | null = null;
  let current = '';

  for (const ch of body) {
    if (closer !== null) {
      if (ch === closer) closer = null;
    } else if (QUOTE_CLOSERS.has(ch)) {
      closer = QUOTE_CLOSERS.get(ch) ?? null;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim() !== '') parts.push(current.trim());
  return parts;
};

const parseColumn = (definition: string): ColumnState | null => {
  if (TABLE_CONSTRAINT.test(definition)) return null;
  const ident = readIdent(definition);
  if (ident === null) return null;

  const word = /^([A-Za-z_]\w*)/.exec(ident.rest)?.[1] ?? '';
  const type = word !== '' && !COLUMN_KEYWORDS.has(word.toLowerCase()) ? word : '';
  return { name: ident.name, type };
};

const parseColumns = (body: string): ColumnState[] =>
  splitTopLevel(body)
    .map((definition) => parseColumn(definition))
    .filter((column): column is ColumnState => column !== null);

const parseVirtualColumns = (body: string): ColumnState[] =>
  splitTopLevel(body)
    .filter((arg) => !arg.includes('='))
    .flatMap((arg) => {
      const ident = readIdent(arg);
      return ident === null ? [] : [{ name: ident.name, type: '' }];
    });

const deleteObjectsOf = (objects: Map<string, ObjectState>, table: string): void => {
  for (const [key, object] of objects) {
    if (object.table === table) objects.delete(key);
  }
};

const renameTable = (state: SchemaState, fromKey: string, toName: string): void => {
  const table = state.tables.get(fromKey);
  if (table === undefined) return;

  const toKey = keyOf(toName);
  state.tables.delete(fromKey);
  state.tables.set(toKey, { name: toName, columns: table.columns });

  for (const object of [...state.indexes.values(), ...state.triggers.values()]) {
    if (object.table === fromKey) object.table = toKey;
  }
};

const applyCreateTable = (state: SchemaState, text: string): void => {
  const { matched: ifNotExists, rest } = skipPrefix(text, IF_NOT_EXISTS);
  const ident = readIdent(rest);
  if (ident === null) return;

  const key = keyOf(ident.name);
  if (ifNotExists && state.tables.has(key)) return;

  const body = ident.rest.trimStart().startsWith('(') ? readParenBody(ident.rest) : null;
  state.tables.set(key, {
    name: ident.name,
    columns: body === null ? [] : parseColumns(body),
  });
};

const applyCreateVirtualTable = (state: SchemaState, text: string): void => {
  const { matched: ifNotExists, rest } = skipPrefix(text, IF_NOT_EXISTS);
  const ident = readIdent(rest);
  if (ident === null) return;

  const key = keyOf(ident.name);
  if (ifNotExists && state.tables.has(key)) return;

  const body = readParenBody(ident.rest);
  state.tables.set(key, {
    name: ident.name,
    columns: body === null ? [] : parseVirtualColumns(body),
  });
};

const applyCreateIndex = (state: SchemaState, text: string): void => {
  const { matched: ifNotExists, rest } = skipPrefix(text, IF_NOT_EXISTS);
  const index = readIdent(rest);
  if (index === null) return;

  const on = skipPrefix(index.rest, /^ON\s+/i);
  const table = on.matched ? readIdent(on.rest) : null;
  if (table === null) return;

  const key = keyOf(index.name);
  if (ifNotExists && state.indexes.has(key)) return;
  state.indexes.set(key, { name: index.name, table: keyOf(table.name) });
};

const applyCreateTrigger = (state: SchemaState, text: string): void => {
  const { matched: ifNotExists, rest } = skipPrefix(text, IF_NOT_EXISTS);
  const trigger = readIdent(rest);
  if (trigger === null) return;

  const onMatch = /\bON\s+/i.exec(trigger.rest);
  if (onMatch === null) return;
  const table = readIdent(trigger.rest.slice(onMatch.index + onMatch[0].length));
  if (table === null) return;

  const key = keyOf(trigger.name);
  if (ifNotExists && state.triggers.has(key)) return;
  state.triggers.set(key, { name: trigger.name, table: keyOf(table.name) });
};

const applyCreate = (state: SchemaState, sql: string): void => {
  const virtual = /^CREATE\s+VIRTUAL\s+TABLE\s+/i.exec(sql);
  if (virtual !== null) return applyCreateVirtualTable(state, sql.slice(virtual[0].length));

  const table = /^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+/i.exec(sql);
  if (table !== null) return applyCreateTable(state, sql.slice(table[0].length));

  const index = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.exec(sql);
  if (index !== null) return applyCreateIndex(state, sql.slice(index[0].length));

  const trigger = /^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TRIGGER\s+/i.exec(sql);
  if (trigger !== null) return applyCreateTrigger(state, sql.slice(trigger[0].length));
};

const applyAlter = (state: SchemaState, sql: string): void => {
  const prefix = /^ALTER\s+TABLE\s+/i.exec(sql);
  if (prefix === null) return;

  const ident = readIdent(sql.slice(prefix[0].length));
  if (ident === null) return;

  const key = keyOf(ident.name);
  const table = state.tables.get(key);
  const action = ident.rest;

  const add = /^ADD\s+(?:COLUMN\s+)?/i.exec(action);
  if (add !== null) {
    const column = parseColumn(action.slice(add[0].length));
    if (table === undefined || column === null) return;
    const exists = table.columns.some((c) => keyOf(c.name) === keyOf(column.name));
    if (!exists) table.columns.push(column);
    return;
  }

  const drop = /^DROP\s+(?:COLUMN\s+)?/i.exec(action);
  if (drop !== null) {
    const column = readIdent(action.slice(drop[0].length));
    if (table === undefined || column === null) return;
    const columnKey = keyOf(column.name);
    table.columns = table.columns.filter((c) => keyOf(c.name) !== columnKey);
    return;
  }

  const renameTo = /^RENAME\s+TO\s+/i.exec(action);
  if (renameTo !== null) {
    const target = readIdent(action.slice(renameTo[0].length));
    if (target !== null) renameTable(state, key, target.name);
  }
};

const applyDrop = (state: SchemaState, sql: string): void => {
  const prefix = /^DROP\s+(TABLE|INDEX|TRIGGER)\s+/i.exec(sql);
  if (prefix === null) return;

  const { rest } = skipPrefix(sql.slice(prefix[0].length), IF_EXISTS);
  const ident = readIdent(rest);
  if (ident === null) return;

  const key = keyOf(ident.name);
  const kind = prefix[1].toUpperCase();

  if (kind === 'TABLE') {
    state.tables.delete(key);
    deleteObjectsOf(state.indexes, key);
    deleteObjectsOf(state.triggers, key);
  } else if (kind === 'INDEX') {
    state.indexes.delete(key);
  } else {
    state.triggers.delete(key);
  }
};

const createSchemaState = (): SchemaState => ({
  tables: new Map(),
  indexes: new Map(),
  triggers: new Map(),
});

const applyDdl = (state: SchemaState, sql: string): void => {
  const statement = sql.trim();
  if (/^CREATE\b/i.test(statement)) applyCreate(state, statement);
  else if (/^ALTER\b/i.test(statement)) applyAlter(state, statement);
  else if (/^DROP\b/i.test(statement)) applyDrop(state, statement);
};

/**
 * Answers the introspection queries migrations use to decide whether to skip work, using the
 * schema produced by the DDL captured so far. Returns null for any other statement.
 */
const introspect = (state: SchemaState, sql: string, parameters: unknown[]): Row[] | null => {
  const statement = sql.trim();

  const tableInfo = /^PRAGMA\s+table_info\s*\((.*)\)$/i.exec(statement);
  if (tableInfo !== null) {
    const table = readIdent(tableInfo[1].trim());
    if (table === null) return [];
    const columns = state.tables.get(keyOf(table.name))?.columns ?? [];
    return columns.map((column, cid) => ({
      cid,
      name: column.name,
      type: column.type,
      notnull: 0,
      dflt_value: null,
      pk: 0,
    }));
  }

  const indexList = /^PRAGMA\s+index_list\s*\((.*)\)$/i.exec(statement);
  if (indexList !== null) {
    const table = readIdent(indexList[1].trim());
    if (table === null) return [];
    const key = keyOf(table.name);
    return [...state.indexes.values()]
      .filter((index) => index.table === key)
      .map((index, seq) => ({ seq, name: index.name, unique: 0, origin: 'c', partial: 0 }));
  }

  if (
    /^SELECT\s+1\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\?/i.test(
      statement
    )
  ) {
    const exists = state.tables.has(keyOf(String(parameters[0] ?? '')));
    return exists ? [{ 1: 1 }] : [];
  }

  if (
    /^SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'trigger'\s+AND\s+name\s+IN\s*\(/i.test(
      statement
    )
  ) {
    const wanted = new Set(parameters.map((value) => keyOf(String(value))));
    return [...state.triggers.values()]
      .filter((trigger) => wanted.has(keyOf(trigger.name)))
      .map((trigger) => ({ name: trigger.name }));
  }

  if (
    /^SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s+NOT\s+LIKE\s+'sqlite_%'$/i.test(
      statement
    )
  ) {
    return [...state.tables.values()].map((table) => ({ name: table.name }));
  }

  return null;
};

export const D1SchemaState = Object.freeze({
  create: createSchemaState,
  applyDdl,
  introspect,
});
