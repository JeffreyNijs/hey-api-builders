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
