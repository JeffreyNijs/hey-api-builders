import { expect, it } from 'vitest';
import { avroAdapter } from '../../packages/test-builders-avro/src/index.js';
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
