import { Column, Schema } from '@orm/Schema';
import { describe, expect, it } from 'vitest';

describe('Schema', () => {
  describe('Column', () => {
    it('should create a column with name and type', () => {
      const col = Column.create('name', 'string');
      expect(col.getDefinition().name).toBe('name');
      expect(col.getDefinition().type).toBe('string');
    });

    it('should set nullable', () => {
      const col = Column.create('name', 'string').nullable();
      expect(col.getDefinition().nullable).toBe(true);
    });

    it('should set unique', () => {
      const col = Column.create('name', 'string').unique();
      expect(col.getDefinition().unique).toBe(true);
    });

    it('should set default value', () => {
      const col = Column.create('name', 'string').default('John');
      expect(col.getDefinition().default).toBe('John');
    });

    it('should set primary key', () => {
      const col = Column.create('id', 'integer').primary();
      expect(col.getDefinition().primary).toBe(true);
    });

    it('should set auto increment', () => {
      const col = Column.create('id', 'integer').autoIncrement();
      expect(col.getDefinition().autoIncrement).toBe(true);
    });

    it('should set unsigned', () => {
      const col = Column.create('age', 'integer').unsigned();
      expect(col.getDefinition().unsigned).toBe(true);
    });

    it('should set comment', () => {
      const col = Column.create('name', 'string').comment('User name');
      expect(col.getDefinition().comment).toBe('User name');
    });

    it('should set references', () => {
      const col = Column.create('user_id', 'integer').references('id').on('users');
      expect(col.getDefinition().references).toBe('id');
      expect(col.getDefinition().on).toBe('users');
    });

    it('should set onDelete', () => {
      const col = Column.create('user_id', 'integer').onDelete('CASCADE');
      expect(col.getDefinition().onDelete).toBe('CASCADE');
    });

    it('should set onUpdate', () => {
      const col = Column.create('user_id', 'integer').onUpdate('CASCADE');
      expect(col.getDefinition().onUpdate).toBe('CASCADE');
    });
  });

  describe('Schema Definition', () => {
    it('should define string column', () => {
      const schema = Schema.create('users');
      const col = schema.string('name');
      expect(col.getDefinition().type).toBe('string');
    });

    it('should define integer column', () => {
      const schema = Schema.create('users');
      const col = schema.integer('age');
      expect(col.getDefinition().type).toBe('integer');
    });

    it('should define boolean column', () => {
      const schema = Schema.create('users');
      const col = schema.boolean('is_active');
      expect(col.getDefinition().type).toBe('boolean');
    });

    it('should define text column', () => {
      const schema = Schema.create('users');
      const col = schema.text('bio');
      expect(col.getDefinition().type).toBe('text');
    });

    it('should define timestamp column', () => {
      const schema = Schema.create('users');
      const col = schema.timestamp('created_at');
      expect(col.getDefinition().type).toBe('timestamp');
    });

    it('should define decimal column', () => {
      const schema = Schema.create('users');
      const col = schema.decimal('price', 10, 2);
      expect(col.getDefinition().type).toBe('decimal');
      expect(col.getDefinition().precision).toBe(10);
      expect(col.getDefinition().scale).toBe(2);
    });

    it('should define json column', () => {
      const schema = Schema.create('users');
      const col = schema.json('metadata');
      expect(col.getDefinition().type).toBe('json');
    });

    it('should define uuid column', () => {
      const schema = Schema.create('users');
      const col = schema.uuid('id');
      expect(col.getDefinition().type).toBe('uuid');
    });

    it('should define date column', () => {
      const schema = Schema.create('users');
      const col = schema.date('birthday');
      expect(col.getDefinition().type).toBe('date');
    });

    it('should define datetime column', () => {
      const schema = Schema.create('users');
      const col = schema.datetime('published_at');
      expect(col.getDefinition().type).toBe('datetime');
    });

    it('should define float column', () => {
      const schema = Schema.create('users');
      const col = schema.float('rating');
      expect(col.getDefinition().type).toBe('float');
    });

    it('should define double column', () => {
      const schema = Schema.create('users');
      const col = schema.double('precision_val');
      expect(col.getDefinition().type).toBe('double');
    });

    it('should define binary column', () => {
      const schema = Schema.create('users');
      const col = schema.binary('data');
      expect(col.getDefinition().type).toBe('binary');
    });

    it('should define enum column', () => {
      const schema = Schema.create('users');
      const col = schema.enum('status', ['active', 'inactive']);
      expect(col.getDefinition().type).toBe('enum');
      expect(col.getDefinition().values).toEqual(['active', 'inactive']);
    });

    it('should define bigInteger column', () => {
      const schema = Schema.create('users');
      const col = schema.bigInteger('large_id');
      expect(col.getDefinition().type).toBe('bigInteger');
    });

    it('should define smallInteger column', () => {
      const schema = Schema.create('users');
      const col = schema.smallInteger('small_id');
      expect(col.getDefinition().type).toBe('smallInteger');
    });

    it('should define tinyInteger column', () => {
      const schema = Schema.create('users');
      const col = schema.tinyInteger('tiny_id');
      expect(col.getDefinition().type).toBe('tinyInteger');
    });

    it('should define mediumInteger column', () => {
      const schema = Schema.create('users');
      const col = schema.mediumInteger('medium_id');
      expect(col.getDefinition().type).toBe('mediumInteger');
    });

    it('should define time column', () => {
      const schema = Schema.create('users');
      const col = schema.time('start_time');
      expect(col.getDefinition().type).toBe('time');
    });

    it('should define year column', () => {
      const schema = Schema.create('users');
      const col = schema.year('birth_year');
      expect(col.getDefinition().type).toBe('year');
    });

    it('should define char column', () => {
      const schema = Schema.create('users');
      const col = schema.char('code', 10);
      expect(col.getDefinition().type).toBe('char');
      expect(col.getDefinition().length).toBe(10);
    });

    it('should define longText column', () => {
      const schema = Schema.create('users');
      const col = schema.longText('content');
      expect(col.getDefinition().type).toBe('longText');
    });

    it('should define mediumText column', () => {
      const schema = Schema.create('users');
      const col = schema.mediumText('summary');
      expect(col.getDefinition().type).toBe('mediumText');
    });

    it('should define tinyText column', () => {
      const schema = Schema.create('users');
      const col = schema.tinyText('note');
      expect(col.getDefinition().type).toBe('tinyText');
    });

    it('should define blob column', () => {
      const schema = Schema.create('users');
      const col = schema.blob('file');
      expect(col.getDefinition().type).toBe('blob');
    });

    it('should define mediumBlob column', () => {
      const schema = Schema.create('users');
      const col = schema.mediumBlob('medium_file');
      expect(col.getDefinition().type).toBe('mediumBlob');
    });

    it('should define longBlob column', () => {
      const schema = Schema.create('users');
      const col = schema.longBlob('large_file');
      expect(col.getDefinition().type).toBe('longBlob');
    });

    it('should define tinyBlob column', () => {
      const schema = Schema.create('users');
      const col = schema.tinyBlob('small_file');
      expect(col.getDefinition().type).toBe('tinyBlob');
    });

    it('should define ipAddress column', () => {
      const schema = Schema.create('users');
      const col = schema.ipAddress('last_login_ip');
      expect(col.getDefinition().type).toBe('ipAddress');
    });

    it('should define macAddress column', () => {
      const schema = Schema.create('users');
      const col = schema.macAddress('device_mac');
      expect(col.getDefinition().type).toBe('macAddress');
    });

    it('should define geometry column', () => {
      const schema = Schema.create('users');
      const col = schema.geometry('location');
      expect(col.getDefinition().type).toBe('geometry');
    });

    it('should define point column', () => {
      const schema = Schema.create('users');
      const col = schema.point('coord');
      expect(col.getDefinition().type).toBe('point');
    });

    it('should define lineString column', () => {
      const schema = Schema.create('users');
      const col = schema.lineString('path');
      expect(col.getDefinition().type).toBe('lineString');
    });

    it('should define polygon column', () => {
      const schema = Schema.create('users');
      const col = schema.polygon('area');
      expect(col.getDefinition().type).toBe('polygon');
    });

    it('should define geometryCollection column', () => {
      const schema = Schema.create('users');
      const col = schema.geometryCollection('shapes');
      expect(col.getDefinition().type).toBe('geometryCollection');
    });

    it('should define multiPoint column', () => {
      const schema = Schema.create('users');
      const col = schema.multiPoint('coords');
      expect(col.getDefinition().type).toBe('multiPoint');
    });

    it('should define multiLineString column', () => {
      const schema = Schema.create('users');
      const col = schema.multiLineString('paths');
      expect(col.getDefinition().type).toBe('multiLineString');
    });

    it('should define multiPolygon column', () => {
      const schema = Schema.create('users');
      const col = schema.multiPolygon('areas');
      expect(col.getDefinition().type).toBe('multiPolygon');
    });

    it('should define increments column', () => {
      const schema = Schema.create('users');
      const col = schema.increments('id');
      expect(col.getDefinition().type).toBe('integer');
      expect(col.getDefinition().autoIncrement).toBe(true);
      expect(col.getDefinition().primary).toBe(true);
    });

    it('should define bigIncrements column', () => {
      const schema = Schema.create('users');
      const col = schema.bigIncrements('id');
      expect(col.getDefinition().type).toBe('bigInteger');
      expect(col.getDefinition().autoIncrement).toBe(true);
      expect(col.getDefinition().primary).toBe(true);
    });

    it('should define timestamps', () => {
      const schema = Schema.create('users');
      schema.timestamps();
      const columns = schema.getColumns();
      expect(columns.has('created_at')).toBe(true);
      expect(columns.has('updated_at')).toBe(true);
    });

    it('should define softDeletes', () => {
      const schema = Schema.create('users');
      schema.softDeletes();
      const columns = schema.getColumns();
      expect(columns.has('deleted_at')).toBe(true);
    });

    it('should define nullable column', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').nullable();
      expect(col.getDefinition().nullable).toBe(true);
    });

    it('should define unique column', () => {
      const schema = Schema.create('users');
      const col = schema.string('email').unique();
      expect(col.getDefinition().unique).toBe(true);
    });

    it('should define column with default value', () => {
      const schema = Schema.create('users');
      const col = schema.string('role').default('user');
      expect(col.getDefinition().default).toBe('user');
    });

    it('should define column with comment', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').comment('User full name');
      expect(col.getDefinition().comment).toBe('User full name');
    });

    it('should define unsigned column', () => {
      const schema = Schema.create('users');
      const col = schema.integer('age').unsigned();
      expect(col.getDefinition().unsigned).toBe(true);
    });

    it('should define column with after', () => {
      const schema = Schema.create('users');
      const col = schema.string('last_name').after('first_name');
      expect(col.getDefinition().after).toBe('first_name');
    });

    it('should define column with first', () => {
      const schema = Schema.create('users');
      const col = schema.string('id').first();
      expect(col.getDefinition().first).toBe(true);
    });

    it('should define column with charset', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').charset('utf8mb4');
      expect(col.getDefinition().charset).toBe('utf8mb4');
    });

    it('should define column with collation', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').collation('utf8mb4_unicode_ci');
      expect(col.getDefinition().collation).toBe('utf8mb4_unicode_ci');
    });

    it('should define column with index', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').index();
      expect(col.getDefinition().index).toBe(true);
    });

    it('should define column with primary', () => {
      const schema = Schema.create('users');
      const col = schema.string('id').primary();
      expect(col.getDefinition().primary).toBe(true);
    });

    it('should define column with autoIncrement', () => {
      const schema = Schema.create('users');
      const col = schema.integer('id').autoIncrement();
      expect(col.getDefinition().autoIncrement).toBe(true);
    });

    it('should define column with references', () => {
      const schema = Schema.create('posts');
      const col = schema.integer('user_id').references('id').on('users');
      expect(col.getDefinition().references).toBe('id');
      expect(col.getDefinition().on).toBe('users');
    });

    it('should define column with onDelete', () => {
      const schema = Schema.create('posts');
      const col = schema.integer('user_id').onDelete('CASCADE');
      expect(col.getDefinition().onDelete).toBe('CASCADE');
    });

    it('should define column with onUpdate', () => {
      const schema = Schema.create('posts');
      const col = schema.integer('user_id').onUpdate('CASCADE');
      expect(col.getDefinition().onUpdate).toBe('CASCADE');
    });

    it('should define column with renameTo', () => {
      const schema = Schema.create('users');
      const col = schema.string('old_name').renameTo('new_name');
      expect(col.getDefinition().renameTo).toBe('new_name');
    });

    it('should define column with change', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').change();
      expect(col.getDefinition().change).toBe(true);
    });

    it('should define column with drop', () => {
      const schema = Schema.create('users');
      const col = schema.string('name').drop();
      expect(col.getDefinition().drop).toBe(true);
    });

    it('should get all columns', () => {
      const schema = Schema.create('users');
      schema.string('name');
      schema.integer('age');

      const columns = schema.getColumns();
      expect(columns.size).toBe(2);
      expect(columns.get('name')?.getDefinition().name).toBe('name');
      expect(columns.get('age')?.getDefinition().name).toBe('age');
    });

    it('should get table name', () => {
      const schema = Schema.create('users');
      expect(schema.getTable()).toBe('users');
    });
  });
});
