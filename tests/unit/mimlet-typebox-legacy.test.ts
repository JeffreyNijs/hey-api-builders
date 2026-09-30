import { expect, it, expectTypeOf } from 'vitest';
import { Type } from '@sinclair/typebox';
import { fromTypeBox, typeBoxAdapter } from '../../packages/typebox-legacy/src/index.js';
import { defineAdapter } from '../../packages/adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/adapter/src/testing.js';
it('keeps legacy Transform semantics separate from modern TypeBox', async () => {
  const schema = Type.Transform(Type.Number())
    .Decode((v) => new Date(v))
    .Encode((v) => v.getTime());
  const native = typeBoxAdapter(schema);
  const b = fromTypeBox(schema).replace(1000);
  expectTypeOf(b.build()).toEqualTypeOf<number>();
  expectTypeOf(b.buildValidated()).toEqualTypeOf<Date>();
  expect(b.buildValidated().getTime()).toBe(1000);
  await assertAdapterConformance(
    defineAdapter({
      id: 'legacy-typebox',
      version: '0.34.52',
      standard: native.standard,
      operations: {},
    }),
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
