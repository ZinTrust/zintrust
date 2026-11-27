import type { RouteRegistration, ValidationSchema } from '@core-routes/RouteRegistry';
import { OpenApiGenerator } from '@/openapi/OpenApiGenerator';
import { Schema } from '@validation/Validator';
import { describe, expect, it } from 'vitest';

const generate = (
  meta: Partial<RouteRegistration['meta']> | undefined,
  options: Partial<Parameters<typeof OpenApiGenerator.generate>[1]> = {},
  path = '/things/:id'
) =>
  OpenApiGenerator.generate(
    [{ method: 'POST', path, meta } as RouteRegistration],
    { title: 'Branches', version: '1', ...options }
  );

describe('OpenApiGenerator uncovered branches', () => {
  it('resolves a ValidationSchema factory through create()', () => {
    const factory: ValidationSchema = {
      create: () => Schema.create().required('name').string('name'),
    };
    const doc = generate({ request: { bodySchema: factory } });
    const schema = doc.paths['/things/{id}']?.['post']?.requestBody?.content['application/json'].schema;

    expect(schema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['name'],
        properties: { name: expect.objectContaining({ type: 'string' }) },
      })
    );
  });

  it('emits an empty schema for fields with no rules', () => {
    const emptyRules = {
      getRules: () => new Map([['empty', []]]),
    } as unknown as ValidationSchema;
    const doc = generate({ request: { bodySchema: emptyRules } });
    const schema = doc.paths['/things/{id}']?.['post']?.requestBody?.content['application/json'].schema;

    expect(schema?.properties?.['empty']).toEqual({});
    expect(schema?.required).toBeUndefined();
  });

  it('maps every openapi type and format branch', () => {
    const schema = Schema.create()
      .boolean('flag')
      .digits('pin')
      .decimal('ratio')
      .positiveNumber('count')
      .email('mail')
      .url('site')
      .ipAddress('host')
      .date('when')
      .string('plain');

    const doc = generate({ request: { bodySchema: schema } });
    const properties = doc.paths['/things/{id}']?.['post']?.requestBody?.content['application/json']
      .schema.properties;

    expect(properties).toMatchObject({
      flag: { type: 'boolean' },
      pin: { type: 'integer' },
      ratio: { type: 'number' },
      count: { type: 'number' },
      mail: { type: 'string', format: 'email' },
      site: { type: 'string', format: 'uri' },
      host: { type: 'string', format: 'ipv4' },
      when: { type: 'string', format: 'date-time' },
      plain: { type: 'string' },
    });
  });

  it('filters enum values to JSON primitives in request bodies', () => {
    const schema = Schema.create()
      .in('mixed', [null, 'text', 7, false, { nested: true }])
      .in('objectsOnly', [{ a: 1 }, [1, 2]]);

    const doc = generate({ request: { bodySchema: schema } });
    const properties = doc.paths['/things/{id}']?.['post']?.requestBody?.content['application/json']
      .schema.properties;

    expect(properties?.['mixed']?.enum).toEqual([null, 'text', 7, false]);
    expect(properties?.['objectsOnly']?.enum).toBeUndefined();
  });

  it('filters enum values to JSON primitives for path params and query params', () => {
    const paramsSchema = Schema.create()
      .in('id', [null, 'a', 2, true, { a: 1 }])
      .array('id');
    const querySchema = Schema.create().in('q', [{ a: 1 }]);

    const doc = generate({
      request: { paramsSchema, querySchema },
    });
    const parameters = doc.paths['/things/{id}']?.['post']?.parameters ?? [];

    expect(parameters.find((p) => p.name === 'id')?.schema.enum).toEqual([null, 'a', 2, true]);
    expect(parameters.find((p) => p.name === 'id')?.schema).toMatchObject({
      type: 'array',
      items: {},
    });
    expect(parameters.find((p) => p.name === 'q')?.schema.enum).toBeUndefined();
  });

  it('omits required when no field is required', () => {
    const doc = generate({ request: { bodySchema: Schema.create().string('optional') } });
    const schema = doc.paths['/things/{id}']?.['post']?.requestBody?.content['application/json'].schema;

    expect(schema).toEqual(
      expect.objectContaining({ type: 'object', properties: { optional: { type: 'string' } } })
    );
    expect(schema?.required).toBeUndefined();
  });

  it('derives an operation id from a path with an unmatched brace', () => {
    const doc = generate(undefined, {}, '/weird/{id');
    expect(doc.paths['/weird/{id']?.['post']?.operationId).toBe('post_weird_id');
  });

  it('defaults the response status to 200 when a schema is present', () => {
    const doc = generate({ response: { schema: { type: 'string' } } });
    expect(doc.paths['/things/{id}']?.['post']?.responses['200']).toEqual({
      description: 'OK',
      content: { 'application/json': { schema: { type: 'string' } } },
    });
  });

  it('trims all-underscore ids, reuses existing paths and omits empty param enums', () => {
    const root = generate(undefined, {}, '/');
    expect(root.paths['/']?.['post']?.operationId).toBe('post_');

    const duplicate = OpenApiGenerator.generate(
      [
        { method: 'GET', path: '/dup', meta: {} },
        { method: 'POST', path: '/dup', meta: {} },
      ] as RouteRegistration[],
      { title: 'Dup', version: '1' }
    );
    expect(Object.keys(duplicate.paths['/dup'] ?? {}).sort()).toEqual(['get', 'post']);

    const paramsSchema = Schema.create().in('id', [{ a: 1 }]);
    const doc = generate({ request: { paramsSchema } });
    expect(
      doc.paths['/things/{id}']?.['post']?.parameters?.find((p) => p.name === 'id')?.schema.enum
    ).toBeUndefined();
  });
});
