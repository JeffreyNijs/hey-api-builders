import { expect, it } from 'vitest';
import { fromJsonSchema, jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
import { createSession } from '../../packages/core/src/index.js';
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

it('generates every string enum value, including values longer than the sampling hint', () => {
  const status = fromJsonSchema({ type: 'string', enum: ['IN_TRANSIT', 'DELIVERED_ON_TIME'] });
  expect(new Set(status.buildList(40))).toEqual(new Set(['IN_TRANSIT', 'DELIVERED_ON_TIME']));
  const event = fromJsonSchema({ type: 'string', enum: ['SHIPMENT_DELIVERED_TO_RECIPIENT'] });
  expect(event.build()).toBe('SHIPMENT_DELIVERED_TO_RECIPIENT');
  expect(fromJsonSchema({ type: 'string', const: 'A_VERY_LONG_CONSTANT_VALUE' }).build()).toBe(
    'A_VERY_LONG_CONSTANT_VALUE'
  );
  // An explicit maxLength is an original constraint and still applies.
  const bounded = fromJsonSchema({
    type: 'string',
    enum: ['short', 'much_too_long_value'],
    maxLength: 5,
  });
  expect(new Set(bounded.buildList(20))).toEqual(new Set(['short']));
});

it('generates varied UTC date-times near the reference instant, independent of time zone', () => {
  const schema = {
    type: 'object',
    required: ['startsAt', 'endsAt'],
    properties: {
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
    },
  } as const;
  const adapter = jsonSchemaAdapter(schema);
  const referenceTime = '2026-06-01T02:00:00.000Z'; // Still 31 May in New York.
  const sample = () =>
    Array.from({ length: 8 }, (_, seed) =>
      adapter.create(createSession({ ...adapter.identity, seed, referenceTime }))
    ) as { startsAt: string; endsAt: string }[];
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const west = sample();
    process.env.TZ = 'Asia/Tokyo';
    expect(sample()).toEqual(west);
    const values = west.flatMap(({ startsAt, endsAt }) => [startsAt, endsAt]);
    expect(new Set(values).size).toBeGreaterThan(values.length / 2);
    for (const value of values) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(Math.abs(Date.parse(value) - Date.parse(referenceTime))).toBeLessThanOrEqual(
        366 * 24 * 60 * 60 * 1000
      );
    }
    expect(fromJsonSchema(schema).buildValidated()).toEqual(fromJsonSchema(schema).build());
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
});

it('changes the replay identity only for schemas that use built-in date-times', () => {
  const plain = jsonSchemaAdapter({ type: 'string', format: 'email' }).identity.configuration;
  const dated = jsonSchemaAdapter({ type: 'string', format: 'date-time' }).identity.configuration;
  const custom = jsonSchemaAdapter(
    { type: 'string', format: 'date-time' },
    {
      formats: { 'date-time': { validate: () => true, generate: () => '2026-01-01T00:00:00Z' } },
      formatsIdentity: 'fixed-date-time/v1',
    }
  ).identity.configuration;
  expect(dated).not.toBe(plain);
  expect(custom).not.toBe(dated);
  expect(jsonSchemaAdapter({ type: 'string', format: 'uuid' }).identity.configuration).toBe(plain);
});
