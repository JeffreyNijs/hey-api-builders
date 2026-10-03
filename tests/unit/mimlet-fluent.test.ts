import { expect, expectTypeOf, it } from 'vitest';
import { createBuilder, fluent } from '../../packages/core/src/index.js';
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

it('accepts undefined in setters only where the property itself does', () => {
  interface Note {
    title: string;
    body?: string;
    draft?: string | undefined;
    due: Date | undefined;
  }
  const notes = fluent(
    createBuilder((): Note => ({ title: 'Plan', due: undefined })),
    ['title', 'body', 'draft', 'due']
  );
  // The exact-optional case (`withBody(undefined)` rejected) needs exactOptionalPropertyTypes,
  // so it is type-checked in the packed Zod fixture; this project compiles without it.
  expectTypeOf(notes.withTitle).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(notes.withDraft).parameter(0).toEqualTypeOf<string | undefined>();
  expectTypeOf(notes.withDue).parameter(0).toEqualTypeOf<Date | undefined>();
  expect(notes.withDraft(undefined).withBody('Notes').build()).toEqual({
    title: 'Plan',
    due: undefined,
    draft: undefined,
    body: 'Notes',
  });
});
