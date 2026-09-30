import { expect, it } from 'vitest';
import * as fc from 'fast-check';
import { createBuilder } from '../../packages/core/src/index.js';
import { mapFixtureArbitrary } from '../../packages/fast-check/src/index.js';
it('shrinks native parameters while retaining explicit overrides', () => {
  const values = mapFixtureArbitrary(fc.integer({ min: 0, max: 100 }), (n) =>
    createBuilder(() => ({ n, role: 'reader' }))
      .with({ role: 'admin' })
      .build()
  );
  const result = fc.check(
    fc.property(values, (v) => v.n < 5),
    { seed: 1, numRuns: 100 }
  );
  expect(result.failed).toBe(true);
  expect(result.counterexample).toEqual([{ n: 5, role: 'admin' }]);
  expect(result.numShrinks).toBeGreaterThan(0);
});
