import { it } from 'node:test';
import { defineAdapter } from '@jeffreynijs/test-builders-adapter';
import { assertAdapterConformance } from '@jeffreynijs/test-builders-adapter/testing';
import { protobufAdapter } from '@jeffreynijs/test-builders-protobuf';
it('Protobuf bigint inputs satisfy the shared adapter contract', async () => {
  const native = protobufAdapter('syntax="proto2"; message Item { required int64 id=1; }', 'Item');
  await assertAdapterConformance(
    defineAdapter({
      id: 'protobuf',
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
