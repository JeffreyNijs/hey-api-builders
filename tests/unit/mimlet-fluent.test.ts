import { expect, expectTypeOf, it } from 'vitest';
import { fluent } from '../../packages/core/src/index.js';
import { fromZodFactory, fromZodFactoryAsync } from '../../packages/zod/src/index.js';
import { fromArkTypeFactory } from '../../packages/arktype/src/index.js';
import { z } from 'zod';
import { type } from 'arktype';

it('adds input-typed setters to native Zod and ArkType builders', async () => {
  const zod = fluent(
    fromZodFactory(z.object({ age: z.string().transform(Number) }), (age: string) => ({ age })),
    ['age']
  );
  const ark = fluent(
    fromArkTypeFactory(type({ age: 'string.numeric.parse' }), (age: string) => ({ age })),
    ['age']
  );
  expectTypeOf(zod.withAge('42').buildValidated('7')).toEqualTypeOf<{ age: number }>();
  expectTypeOf(ark.withAge('42').buildValidated('7')).toEqualTypeOf<{ age: number }>();
  expect(zod.withAge('42').buildValidated('7')).toEqual({ age: 42 });
  expect(ark.withAge('42').buildValidated('7')).toEqual({ age: 42 });
  const asynchronous = fluent(
    fromZodFactoryAsync(z.object({ name: z.string() }), () => ({ name: '' })),
    ['name']
  );
  expect(await asynchronous.withName('Ada').buildValidatedAsync()).toEqual({ name: 'Ada' });
});
