import { OpenApiGenerator } from '@/openapi/OpenApiGenerator';
import type { RouteRegistration } from '@routing/RouteRegistry';
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
    expect(doc.paths['/users/{id}']?.get).toBeDefined();

    const getUser = doc.paths['/users/{id}']!.get;
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

    const postUsers = doc.paths['/users']!.post;
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
});
