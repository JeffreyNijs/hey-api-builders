import { expect, it, expectTypeOf } from 'vitest';
import * as v from 'valibot';
import { fromValibot } from '../../packages/valibot/src/index.js';
it('generates schema input and preserves Valibot output transforms', () => {
  const schema = v.pipe(v.string(), v.transform(Number));
  const builder = fromValibot(schema).replace('42');
  expectTypeOf(builder.build()).toEqualTypeOf<string>();
  expectTypeOf(builder.buildValidated()).toEqualTypeOf<number>();
  expect(builder.buildValidated()).toBe(42);
});
