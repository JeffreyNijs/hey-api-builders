import { expect, it } from 'vitest';
import { fromJsonSchema, jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
it.each(['draft-07', 'draft-2019-09', 'draft-2020-12'] as const)(
  'keeps %s generation bounded and reproducible',
  (dialect) => {
    const schema = { type: 'integer', minimum: 2, maximum: 5 } as const;
    const adapter = jsonSchemaAdapter(schema, { dialect, profile: 'boundary' });
    const values = Array.from({ length: 12 }, () => adapter.create(adapter.session(42)));
    expect(
      values.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= 5)
    ).toBe(true);
    expect(new Set(values).size).toBe(1);
    expect(() => adapter.negative(adapter.session(1), () => 3)).toThrow();
  }
);

it('shares one default session across a session-less builder list', () => {
  const schema = { type: 'integer', minimum: 1, maximum: 1_000_000 } as const;
  const adapter = jsonSchemaAdapter(schema);
  const builder = fromJsonSchema(schema);
  const list = builder.buildList(4);
  expect(new Set(list).size).toBe(4);
  expect(list).toEqual(builder.buildList(4, adapter.session()));
  expect(builder.buildValidatedList(4)).toEqual(list);
  // A single session-less build keeps its documented seed-1 value.
  expect(builder.build()).toBe(adapter.create());
  expect(builder.build()).toBe(list[0]);
});
