import { OpenApiGenerator } from '@/openapi/OpenApiGenerator';
import type { RouteRegistration } from '@core-routes/RouteRegistry';
import { Schema } from '@validation/Validator';
import { describe, expect, it } from 'vitest';

describe('OpenApiGenerator', () => {
  it('generates OpenAPI paths, params, and request bodies from RouteRegistry entries', () => {
    const querySchema = Schema.create().required('q').string('q');
    const paramsSchema = Schema.create().required('id').integer('id');
    const bodySchema = Schema.create().required('name').string('name');

    const routes: RouteRegistration[] = [
      {
        method: 'GET',
        path: '/users/:id',
        meta: {
          summary: 'Get user',
          tags: ['Users'],
          request: {
            querySchema,
            paramsSchema,
          },
        },
      },
      {
        method: 'POST',
        path: '/users',
        meta: {
          summary: 'Create user',
          tags: ['Users'],
          request: {
            bodySchema,
          },
          response: {
            status: 201,
            schema: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
      },
      {
        method: 'GET',
        path: '/docs',
      },
    ];

    const doc = OpenApiGenerator.generate(routes, {
      title: 'Test API',
      version: '1.0.0',
      excludePaths: ['/docs'],
    });

    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('Test API');

    expect(doc.paths['/users/{id}']).toBeDefined();
    expect(doc.paths['/users/{id}']?.['get']).toBeDefined();

    const getUser = doc.paths['/users/{id}']['get'];
    expect(getUser.summary).toBe('Get user');
    expect(getUser.tags).toEqual(['Users']);

    const params = getUser.parameters ?? [];
    expect(params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'id',
          in: 'path',
          required: true,
          schema: expect.any(Object),
        }),
        expect.objectContaining({
          name: 'q',
          in: 'query',
          required: true,
          schema: expect.any(Object),
        }),
      ])
    );

    const idParam = params.find((p) => p.name === 'id' && p.in === 'path');
    expect(idParam?.schema).toEqual(expect.objectContaining({ type: 'integer' }));

    const postUsers = doc.paths['/users']['post'];
    expect(postUsers.requestBody?.content['application/json'].schema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['name'],
        properties: {
          name: expect.objectContaining({ type: 'string' }),
        },
      })
    );

    expect(doc.paths['/docs']).toBeUndefined();
  });

  it('emits parameters, enums, and operation metadata for query/header schemas', () => {
    const querySchema = Schema.create()
      .required('status')
      .in('status', ['open', 'closed', { bad: true }] as any)
      .min('count', 1)
      .max('count', 10)
      .regex('search', /foo.*/);

    const headersSchema = Schema.create().required('x-request-id').uuid('x-request-id');
    const paramsSchema = Schema.create().required('id').integer('id');

    const routes: RouteRegistration[] = [
      {
        method: 'GET',
        path: '/reports/:id/export',
        meta: {
          summary: 'Export report',
          description: 'Exports report data',
          tags: ['Reports'],
          request: {
            querySchema,
            headersSchema,
            paramsSchema,
          },
          response: {
            status: 204,
          },
        },
      },
    ];

    const doc = OpenApiGenerator.generate(routes, {
      title: 'Reports API',
      version: '1.2.3',
      serverUrl: ' https://api.example.com ',
    });

    const op = doc.paths['/reports/{id}/export']?.['get'];
    expect(op?.operationId).toBe('get_reports__id__export');
    expect(op?.summary).toBe('Export report');
    expect(doc.servers).toEqual([{ url: 'https://api.example.com' }]);

    const params = op?.parameters ?? [];
    const statusParam = params.find((p) => p.name === 'status' && p.in === 'query');
    const countParam = params.find((p) => p.name === 'count' && p.in === 'query');
    const searchParam = params.find((p) => p.name === 'search' && p.in === 'query');
    const headerParam = params.find((p) => p.name === 'x-request-id' && p.in === 'header');

    expect(statusParam?.schema.enum).toEqual(['open', 'closed']);
    expect(countParam?.schema.minimum).toBe(1);
    expect(countParam?.schema.maximum).toBe(10);
    expect(searchParam?.schema.pattern).toBe('foo.*');
    expect(headerParam?.schema).toEqual(
      expect.objectContaining({ type: 'string', format: 'uuid' })
    );

    expect(op?.responses['204'].description).toBe('No Content');
  });

  it('includes array schema details and default response when none provided', () => {
    const bodySchema = Schema.create().array('tags').required('tags');

    const routes: RouteRegistration[] = [
      {
        method: 'POST',
        path: '/tags',
        meta: {
          request: {
            bodySchema,
          },
        },
      },
    ];

    const doc = OpenApiGenerator.generate(routes, {
      title: 'Tags API',
      version: '0.1.0',
    });

    const op = doc.paths['/tags']?.['post'];
    const schema = op?.requestBody?.content['application/json'].schema;

    expect(schema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['tags'],
        properties: {
          tags: expect.objectContaining({ type: 'array', items: {} }),
        },
      })
    );

    expect(op?.responses['200']).toEqual(expect.objectContaining({ description: 'OK' }));
  });
});
