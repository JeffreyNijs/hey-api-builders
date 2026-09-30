import { expect, it } from 'vitest';
import { jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
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
