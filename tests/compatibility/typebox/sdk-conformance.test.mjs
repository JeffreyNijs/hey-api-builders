import { it } from 'node:test';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import Type from 'typebox';
import { Type as Legacy } from '@sinclair/typebox';
import { typeBoxAdapter as modern } from '@mimlet/typebox';
import { typeBoxAdapter as legacy } from '@mimlet/typebox-legacy';
for (const [id, T, adapt] of [
  ['typebox', Type, modern],
  ['legacy-typebox', Legacy, legacy],
]) {
  it(`${id} satisfies the shared native input/validation contract`, async () => {
    const native = adapt(T.Number({ minimum: 1 }));
    await assertAdapterConformance(
      defineAdapter({
        id,
        version: 'locked',
        standard: native.standard,
        operations: { checkInput: native.check },
      }),
      [
        { name: 'valid number', input: () => 2, valid: true, output: (value) => value === 2 },
        { name: 'invalid number', input: () => 0, valid: false },
        { name: 'wrong representation', input: () => '2', valid: false },
      ]
    );
  });
}
