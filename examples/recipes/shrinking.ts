import * as fc from 'fast-check';
import { createScenario } from 'mimlet';
import { scenarioArbitrary, checkFixtureProperty } from '@mimlet/fast-check';

const identity = { fingerprint: 'basket/v1', provider: 'my-test@1' };
const cart = createScenario()
  .node('prices', [], () => [] as number[])
  .node('total', ['prices'], ({ prices }) => prices.reduce((sum, n) => sum + n, 0));
const baskets = scenarioArbitrary(
  fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
  (prices) => cart.override('prices', () => prices),
  { ...identity, seed: 42 }
);

// Deliberately false property: inspect its report without making the example fail CI.
export const report = checkFixtureProperty(baskets, (basket) => basket.total < 5, {
  identity,
  seed: 12345,
  numRuns: 100,
});
// Shrinking recomputes total from prices; the minimal counterexample is { prices: [5], total: 5 }.
// In a real test, use assertFixtureProperty so a failed property fails the test.
