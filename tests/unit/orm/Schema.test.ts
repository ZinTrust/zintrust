import { Column, Schema } from '@orm/Schema';
import { describe, expect, it } from 'vitest';

describe('Schema', () => {
  describe('Column', () => {
    it('should create a column with default values', () => {
      const column = new Column('test_col', 'string');
      const def = column.getDefinition();

      expect(def.name).toBe('test_col');
      expect(def.type).toBe('string');
      expect(def.nullable).toBe(false);
      expect(def.unique).toBe(false);
      expect(def.primary).toBe(false);
      expect(def.index).toBe(false);
    });

    it('should set nullable', () => {
      const column = new Column('test_col', 'string').nullable();
      expect(column.getDefinition().nullable).toBe(true);
    });

    it('should set default value', () => {
      const column = new Column('test_col', 'string').default('test');
      expect(column.getDefinition().default).toBe('test');
    });

    it('should set unique', () => {
      const column = new Column('test_col', 'string').unique();
      expect(column.getDefinition().unique).toBe(true);
    });

    it('should set primary', () => {
      const column = new Column('test_col', 'string').primary();
      expect(column.getDefinition().primary).toBe(true);
    });

    it('should set index', () => {
      const column = new Column('test_col', 'string').index();
      expect(column.getDefinition().index).toBe(true);
    });
  });

  describe('Schema Definition', () => {
    it('should define string column', () => {
      const schema = new Schema('users');
      const col = schema.string('name');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('string');
    });

    it('should define integer column', () => {
      const schema = new Schema('users');
      const col = schema.integer('age');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('integer');
    });

    it('should define boolean column', () => {
      const schema = new Schema('users');
      const col = schema.boolean('is_active');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('boolean');
    });

    it('should define date column', () => {
      const schema = new Schema('users');
      const col = schema.date('created_at');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('date');
    });

    it('should define datetime column', () => {
      const schema = new Schema('users');
      const col = schema.datetime('updated_at');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('datetime');
    });

    it('should define json column', () => {
      const schema = new Schema('users');
      const col = schema.json('metadata');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('json');
    });

    it('should define text column', () => {
      const schema = new Schema('users');
      const col = schema.text('bio');
      expect(col).toBeInstanceOf(Column);
      expect(col.getDefinition().type).toBe('text');
    });

    it('should get all columns', () => {
      const schema = new Schema('users');
      schema.string('name');
      schema.integer('age');

      const columns = schema.getColumns();
      expect(columns).toHaveLength(2);
      expect(columns[0].name).toBe('name');
      expect(columns[1].name).toBe('age');
    });

    it('should get table name', () => {
      const schema = new Schema('users');
      expect(schema.getTable()).toBe('users');
    });
  });
});
