import { expect, it, expectTypeOf } from 'vitest';
import Type from 'typebox';
import { fromTypeBox, typeBoxAdapter } from '../../packages/test-builders-typebox/src/index.js';
import { defineAdapter } from '../../packages/test-builders-adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/test-builders-adapter/src/testing.js';
it('preserves native TypeBox codec input/output and the shared validation contract', async () => {
  const schema = Type.Codec(Type.Number())
    .Decode((v) => new Date(v))
    .Encode((v) => v.getTime());
  const native = typeBoxAdapter(schema);
  const b = fromTypeBox(schema).replace(1000);
  expectTypeOf(b.build()).toEqualTypeOf<number>();
  expectTypeOf(b.buildValidated()).toEqualTypeOf<Date>();
  expect(b.buildValidated().getTime()).toBe(1000);
  await assertAdapterConformance(
    defineAdapter({ id: 'typebox', version: '1.3.34', standard: native.standard, operations: {} }),
    [
      {
        name: 'encoded number',
        input: () => 1000,
        valid: true,
        output: (v) => v instanceof Date && v.getTime() === 1000,
      },
      { name: 'invalid input', input: () => null, valid: false },
    ]
  );
});
