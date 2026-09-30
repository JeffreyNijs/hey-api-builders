import { expect, it } from 'vitest';
import { protobufAdapter } from '../../packages/test-builders-protobuf/src/index.js';
it('preserves 64-bit values and rejects invalid message presence', () => {
  const adapter = protobufAdapter(
    'syntax="proto2"; message Event { required int64 id=1; optional string note=2; }',
    'Event'
  );
  const value = { id: 9223372036854775807n };
  expect(adapter.decode(adapter.encode(value))).toEqual(value);
  expect(adapter.check({})).toBe(false);
  expect(adapter.check({ id: 9223372036854775808n })).toBe(false);
});
