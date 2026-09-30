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
