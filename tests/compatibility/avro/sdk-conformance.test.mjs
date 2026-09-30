import { it } from 'node:test';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import { avroAdapter } from '@mimlet/avro';
it('Avro native records satisfy the shared adapter contract', async () => {
  const native = avroAdapter({
    type: 'record',
    name: 'Item',
    fields: [{ name: 'id', type: 'long' }],
  });
  await assertAdapterConformance(
    defineAdapter({
      id: 'avro',
      version: 'locked',
      standard: native.standard,
      operations: { checkInput: native.check },
    }),
    [
      {
        name: 'lossless integer',
        input: () => ({ id: 42n }),
        valid: true,
        output: (value) => value.id === 42n,
      },
      { name: 'missing required field', input: () => ({}), valid: false },
    ]
  );
});
