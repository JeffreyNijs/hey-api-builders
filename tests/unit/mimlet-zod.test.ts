import { expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import * as mini from 'zod/mini';
import {
  fromZod,
  fromZodAsync,
  fromZodFactory,
  fromZodFactoryAsync,
  zodAdapter,
} from '../../packages/zod/src/index.js';
import { BuilderValidationError } from '../../packages/core/src/index.js';

it('keeps generated input separate from native transformed output', () => {
  let calls = 0;
  const schema = z.object({ age: z.literal('42') }).transform(({ age }) => {
    calls++;
    return { age: Number(age) };
  });
  const builder = fromZod(schema);
  expectTypeOf(builder.build).returns.toEqualTypeOf<{ age: '42' }>();
  expectTypeOf(builder.buildValidated).returns.toEqualTypeOf<{ age: number }>();
  expect(builder.build()).toEqual({ age: '42' });
  expect(calls).toBe(0);
  expect(builder.buildValidated()).toEqual({ age: 42 });
  expect(calls).toBe(1);
});

it('runs explicit async refinements once and preserves factory arguments', async () => {
  let calls = 0;
  const schema = z.object({
    name: z.string().refine(async () => {
      calls++;
      return true;
    }),
  });
  const builder = fromZodFactoryAsync(schema, (id: number, prefix = 'user') => ({
    name: `${prefix}-${id}`,
  }));
  expectTypeOf(builder.buildValidatedAsync).parameters.toEqualTypeOf<
    [id: number, prefix?: string]
  >();
  expect(await builder.buildValidatedAsync(42)).toEqual({ name: 'user-42' });
  expect(calls).toBe(1);
  const automatic = fromZodAsync(schema);
  await automatic.buildValidatedAsync();
  expect(calls).toBe(2);
});

it('preserves callback exceptions without the native Standard entry retrying them', () => {
  let calls = 0;
  const error = new Error('caller failure');
  const schema = z.string().transform(() => {
    calls++;
    throw error;
  });
  expect(() => fromZodFactory(schema, () => 'input').buildValidated()).toThrow(error);
  expect(calls).toBe(1);
});

it('supports Zod Mini through the shared native Zod core API', () => {
  const builder = fromZod(mini.object({ name: mini.literal('Ada') }));
  expectTypeOf(builder.buildValidated).returns.toEqualTypeOf<{ name: 'Ada' }>();
  expect(builder.buildValidated()).toEqual({ name: 'Ada' });
});

it('keeps native-only factory values and useful validation paths', () => {
  const schema = z.object({ created: z.date() });
  expect(() => fromZod(schema)).toThrow();
  const builder = fromZodFactory(schema, (time: number) => ({ created: new Date(time) }));
  expect(builder.buildValidated(42).created.getTime()).toBe(42);
  expect(() =>
    fromZodFactory(z.object({ count: z.number().min(1) }), () => ({ count: 0 })).buildValidated()
  ).toThrow(BuilderValidationError);
});

it('delegates reversible codecs to the native encoder and decoder', async () => {
  const schema = z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  });
  const adapter = zodAdapter(schema);
  const input = '2026-01-01T00:00:00.000Z';
  expect(adapter.encode(adapter.decode(input))).toBe(input);
  expect(await adapter.encodeAsync(await adapter.decodeAsync(input))).toBe(input);
});
