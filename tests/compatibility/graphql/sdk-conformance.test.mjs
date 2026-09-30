import { it } from 'node:test';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import { graphqlAdapter } from '@mimlet/graphql';
it('GraphQL variables satisfy the shared adapter contract with native defaults', async () => {
  const native = graphqlAdapter(
    'type Query { echo(value: Int!): Int! }',
    'query($n: Int! = 5) { echo(value:$n) }'
  ).variables;
  await assertAdapterConformance(
    defineAdapter({
      id: 'graphql',
      version: 'locked',
      standard: native.standard,
      operations: { checkInput: native.check },
    }),
    [
      { name: 'native default', input: () => ({}), valid: true, output: (value) => value.n === 5 },
      { name: 'invalid variable', input: () => ({ n: null }), valid: false },
    ]
  );
});
