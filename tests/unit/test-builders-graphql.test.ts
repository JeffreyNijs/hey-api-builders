import { expect, it } from 'vitest';
import { graphqlAdapter } from '../../packages/test-builders-graphql/src/index.js';
it('retains aliases, input defaults and selected response fields', () => {
  const adapter = graphqlAdapter(
    'type Query { echo(value: Int! = 3): Int! }',
    'query($n: Int! = 5) { result: echo(value:$n) }'
  );
  const variables = adapter.variables.builder().buildValidated();
  expect(variables).toEqual({ n: 5 });
  const response = adapter.response(variables);
  expect(response.check({ result: 7 })).toBe(true);
  expect(response.check({ echo: 7 })).toBe(false);
});
