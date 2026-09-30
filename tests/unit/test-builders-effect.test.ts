import { expect, it, expectTypeOf } from 'vitest';
import * as S from 'effect/Schema';
import { fromEffectFactory, effectAdapter } from '../../packages/test-builders-effect/src/index.js';
import { defineAdapter } from '../../packages/test-builders-adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/test-builders-adapter/src/testing.js';
it('retains native Effect decoding and shared conformance', async () => {
  const schema = S.NumberFromString;
  const native = effectAdapter(schema);
  const builder = fromEffectFactory(schema, () => '42');
  expectTypeOf(builder.build()).toEqualTypeOf<string>();
  expectTypeOf(builder.buildValidated()).toEqualTypeOf<number>();
  expect(builder.buildValidated()).toBe(42);
  await assertAdapterConformance(
    defineAdapter({ id: 'effect', version: '3.22.2', standard: native.standard, operations: {} }),
    [
      { name: 'encoded number', input: () => '42', valid: true, output: (v) => v === 42 },
      { name: 'invalid input', input: () => null, valid: false },
    ]
  );
});
