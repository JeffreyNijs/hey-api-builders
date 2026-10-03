import { expect, it } from 'vitest';
import { openApi } from '../../packages/api/src/index.js';
it('retains HTTP operation direction and response selection', () => {
  const api = openApi({
    openapi: '3.1.0',
    paths: {
      '/users': {
        post: {
          operationId: 'createUser',
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { type: 'integer' } },
                    required: ['id'],
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const response = api.response({ operationId: 'createUser', status: 201 });
  expect(response.builder().buildValidated()).toHaveProperty('body.id');
  expect(() => api.response({ operationId: 'createUser', status: 404 })).toThrow();
});

it('shares one default session across a session-less envelope list', () => {
  const api = openApi(
    {
      openapi: '3.1.0',
      paths: {
        '/users': {
          get: {
            operationId: 'getUser',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { id: { type: 'integer', minimum: 1, maximum: 1_000_000 } },
                      required: ['id'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    { profile: 'random' }
  );
  const response = api.response({ operationId: 'getUser', status: 200 });
  const builder = response.builder();
  const list = builder.buildList(4);
  expect(new Set(list.map((value) => JSON.stringify(value))).size).toBe(4);
  expect(list).toEqual(builder.buildList(4, response.session()));
  expect(builder.build()).toEqual(list[0]);
});

it('honours readOnly and writeOnly beside $ref in OpenAPI 3.1 only', () => {
  const document = (openapi: string) => ({
    openapi,
    info: { title: 'Things', version: '1' },
    paths: {
      '/things': {
        post: {
          operationId: 'create',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name', 'secret'],
                  additionalProperties: false,
                  properties: {
                    id: { $ref: '#/components/schemas/Id', readOnly: true },
                    name: { type: 'string' },
                    secret: { $ref: '#/components/schemas/Id', writeOnly: true },
                  },
                },
              },
            },
          },
          responses: { '204': { description: 'Created' } },
        },
      },
    },
    components: { schemas: { Id: { type: 'string', pattern: '^T-[0-9]{3}$' } } },
  });
  const request = openApi(document('3.1.0')).request({ operationId: 'create' });
  expect(request.check({ body: { name: 'Crate', secret: 'T-001' } })).toBe(true);
  const generated = request.create(request.session(1)).body as Record<string, unknown>;
  expect('id' in generated).toBe(false);
  expect('secret' in generated).toBe(true);
  // OpenAPI 3.0 ignores $ref siblings, so the referenced schema alone decides.
  const legacy = openApi(document('3.0.3')).request({ operationId: 'create' });
  expect(legacy.check({ body: { name: 'Crate', secret: 'T-001' } })).toBe(false);
});
