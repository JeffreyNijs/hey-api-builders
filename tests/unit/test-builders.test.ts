import { describe, expect, it, expectTypeOf } from 'vitest';
import * as fc from 'fast-check';
import {
  createBuilder,
  createSchemaBuilder,
  createSession,
  restoreSession,
  createScenario,
} from '../../packages/test-builders/src/index.js';
import { z } from 'zod';
describe('source builder contracts', () => {
  it('keeps branches isolated and applies transforms after ordered patches', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 20 }), (values) => {
        const original = createBuilder(() => ({ value: 0 }));
        let branch = original.transform((v) => ({ value: v.value + 1 }));
        for (const value of values) {
          branch = branch.with({ value });
        }
        expect(branch.build().value).toBe((values.at(-1) ?? 0) + 1);
        expect(original.build()).toEqual({ value: 0 });
      }),
      { seed: 42, numRuns: 100 }
    );
  });
  it('retains factory arguments and distinct parsed output', () => {
    const builder = createSchemaBuilder(
      z.object({ age: z.string() }).transform((v) => ({ age: Number(v.age) })),
      (age: string) => ({ age })
    );
    expectTypeOf(builder.build('42')).toEqualTypeOf<{ age: string }>();
    expectTypeOf(builder.buildValidated('42')).toEqualTypeOf<{ age: number }>();
    expect(builder.buildValidated('42')).toEqual({ age: 42 });
  });
  it('replays scoped generation and recomputes dependent scenario values', () => {
    const identity = { fingerprint: 'unit/v1', provider: 'unit' };
    const session = createSession({ ...identity, seed: 42 });
    const before = session.snapshot();
    const recipe = createScenario()
      .node('price', [], (_dependencies, session) => session.integer(1, 100))
      .node('total', ['price'], ({ price }) => price * 3);
    expect(recipe.build(session)).toEqual(recipe.build(restoreSession(before, identity)));
    expect(recipe.override('price', () => 4).build(session)).toEqual({ price: 4, total: 12 });
  });
});
