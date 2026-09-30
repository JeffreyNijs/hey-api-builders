import { expect, it } from 'vitest';
import { snapshotRequest } from '../../packages/playground/src/request.js';
it('snapshots plain request data without invoking getters', () => {
  const original = { schema: { type: 'integer' }, count: 2 };
  const snapshot = snapshotRequest(original);
  original.schema.type = 'string';
  expect(snapshot.schema).toEqual({ type: 'integer' });
  let reads = 0;
  expect(() =>
    snapshotRequest({
      get schema() {
        reads++;
        return { type: 'integer' };
      },
    })
  ).toThrow();
  expect(reads).toBe(0);
  expect(() => snapshotRequest({ schema: {}, count: 51 })).toThrow();
});
