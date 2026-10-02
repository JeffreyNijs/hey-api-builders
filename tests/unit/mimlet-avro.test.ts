import { expect, it } from 'vitest';
import { avroAdapter } from '../../packages/avro/src/index.js';
it('round-trips long extremes without accepting unsafe numeric values', () => {
  const adapter = avroAdapter({
    type: 'record',
    name: 'Event',
    fields: [{ name: 'id', type: 'long' }],
  });
  for (const id of [-(1n << 63n), (1n << 63n) - 1n]) {
    expect(adapter.decode(adapter.encode({ id }))).toEqual({ id });
  }
  expect(adapter.check({ id: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
});

it('shares one default session across a session-less builder list', () => {
  const adapter = avroAdapter(
    { type: 'record', name: 'Event', fields: [{ name: 'id', type: 'int' }] },
    { profile: 'random' }
  );
  const builder = adapter.builder();
  const list = builder.buildList(4);
  expect(new Set(list.map((event) => JSON.stringify(event))).size).toBe(4);
  expect(list).toEqual(builder.buildList(4, adapter.session()));
  expect(builder.build()).toEqual(list[0]);
});
