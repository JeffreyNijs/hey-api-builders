import { it } from 'node:test';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import * as S from 'effect/Schema';
import { effectAdapter } from '@mimlet/effect';
it('native Effect decoding satisfies the shared adapter contract', async () => {
  const native = effectAdapter(S.NumberFromString);
  await assertAdapterConformance(
    defineAdapter({
      id: 'effect',
      version: 'locked',
      standard: native.standard,
      operations: { checkInput: native.checkInput },
    }),
    [
      { name: 'encoded input', input: () => '42', valid: true, output: (value) => value === 42 },
      { name: 'invalid input', input: () => null, valid: false },
    ]
  );
});
