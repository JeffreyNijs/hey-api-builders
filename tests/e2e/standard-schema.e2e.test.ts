import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { BuilderValidationError, createSchemaBuilder } from '../../packages/core/src/index.js';

describe('real Zod Standard Schema interoperability', () => {
  it('infers input patches and transformed output without inspecting Zod internals', () => {
    let calls = 0;
    const schema = z.object({ age: z.string() }).transform(({ age }) => {
      calls += 1;
      return { age: Number(age) };
    });
    const base = createSchemaBuilder(schema, () => ({ age: '42' }));
    const changed = base.with({ age: '43' });
    expectTypeOf(changed.build()).toEqualTypeOf<{ age: string }>();
    const value = changed.buildValidated();
    expectTypeOf(value).toEqualTypeOf<{ age: number }>();
    expect(value).toEqual({ age: 43 });
    expect(calls).toBe(1);
    expect(base.build()).toEqual({ age: '42' });
  });

  it('validates async refinements through the async API', async () => {
    const schema = z.string().refine(async (value) => value === 'allowed');
    const base = createSchemaBuilder(schema, async () => 'allowed');
    await expect(base.buildValidatedAsync()).resolves.toBe('allowed');
    await expect(base.with('blocked').buildValidatedAsync()).rejects.toBeInstanceOf(
      BuilderValidationError
    );
  });

  it('preserves error paths and allows unchecked invalid fixtures', () => {
    const schema = z.object({ age: z.number().int().positive() });
    const base = createSchemaBuilder(schema, () => ({ age: 42 })).with({ age: -1 });
    expect(base.build()).toEqual({ age: -1 });
    expect(() => base.buildValidated()).toThrow(BuilderValidationError);
    try {
      base.buildValidated();
    } catch (error) {
      expect(error).toBeInstanceOf(BuilderValidationError);
      expect((error as BuilderValidationError).issues[0]?.path).toEqual(['age']);
    }
  });

  it('returns Date outputs without spreading or validating them as input again', () => {
    const schema = z.string().transform((value) => new Date(value));
    const base = createSchemaBuilder(schema, () => '2026-01-01T00:00:00.000Z');
    expectTypeOf(base.buildValidated()).toEqualTypeOf<Date>();
    expect(base.buildValidated().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(base.build()).toBe('2026-01-01T00:00:00.000Z');
  });
});
