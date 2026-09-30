import { it } from 'node:test';
import { defineAdapter } from '@jeffreynijs/test-builders-adapter';
import { assertAdapterConformance } from '@jeffreynijs/test-builders-adapter/testing';
import { avroAdapter } from '@jeffreynijs/test-builders-avro';
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
