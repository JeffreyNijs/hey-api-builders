import { expect, it } from 'vitest';
import { z } from 'zod';
import { type } from 'arktype';
import { defineAdapter, fromAdapter } from '../../packages/adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/adapter/src/testing.js';
it.each([
  ['zod', z.string().transform(Number)],
  ['arktype', type('string').pipe(Number)],
] as const)('checks %s through the shared standards contract', async (id, standard) => {
  const adapter = defineAdapter({
    id,
    version: 'locked',
    standard,
    operations: { create: () => '42' },
  });
  expect(fromAdapter(adapter).buildValidated()).toBe(42);
  await assertAdapterConformance(adapter, [
    { name: 'valid input', input: () => '42', valid: true, output: (v) => v === 42 },
    { name: 'invalid input', input: () => null, valid: false },
  ]);
});
