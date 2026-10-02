import { expect, it, expectTypeOf } from 'vitest';
import * as S from 'effect/Schema';
import {
  fromEffect,
  fromEffectAsync,
  fromEffectFactory,
  effectAdapter,
} from '../../packages/effect/src/index.js';
import { createSession } from '../../packages/core/src/index.js';
import { defineAdapter } from '../../packages/adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/adapter/src/testing.js';
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

it('rejects a missing session with an explicit error instead of a native crash', async () => {
  const missing = /requires an explicit GenerationSession/;
  const people = fromEffect(S.Struct({ name: S.String })).with({ name: 'Ada' });
  // @ts-expect-error Native Effect generation has no default session.
  expect(() => people.buildValidated()).toThrow(missing);
  // @ts-expect-error Lists require the same explicit session.
  expect(() => people.buildList(2)).toThrow(TypeError);
  // @ts-expect-error Asynchronous encoding requires the same explicit session.
  await expect(fromEffectAsync(S.Int).buildAsync()).rejects.toThrow(missing);
  const session = createSession({ seed: 123, fingerprint: 'user/v1', provider: 'effect@3.22.2' });
  expect(people.buildValidated(session)).toEqual({ name: 'Ada' });
});
