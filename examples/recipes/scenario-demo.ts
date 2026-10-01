import * as fc from 'fast-check';
import { cloneFixture, createScenario } from '@mimlet/core';
import { checkFixtureProperty, replayFixtureProperty, scenarioArbitrary } from '@mimlet/fast-check';
import type { PropertyReplay } from '@mimlet/fast-check';

const recipe = createScenario()
  .node('customer', [], () => ({ id: 'customer-1', name: 'Ada' }))
  .node('prices', [], () => [] as number[])
  .node('order', ['customer', 'prices'], ({ customer, prices }) => ({
    id: 'order-1',
    customerId: customer.id,
    totalCents: prices.reduce((total, price) => total + price, 0),
  }))
  .node('lines', ['order', 'prices'], ({ order, prices }) =>
    prices.map((price, index) => ({
      id: `line-${index + 1}`,
      orderId: order.id,
      priceCents: price,
    }))
  );

export type DemoOrder = ReturnType<typeof recipe.build>;
export interface DemoReplay {
  readonly format: 'mimlet/scenario-demo';
  readonly version: 1;
  readonly budgetCents: number;
  readonly replay: PropertyReplay;
}
export interface DemoResult {
  readonly failed: boolean;
  readonly runs: number;
  readonly shrinks: number;
  readonly first?: DemoOrder;
  readonly shrunk?: DemoOrder;
  readonly replay?: DemoReplay;
}
function identity(budgetCents: number) {
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 1 || budgetCents > 200) {
    throw new RangeError('Demo budget must be an integer between 1 and 200 cents');
  }
  return {
    fingerprint: 'mimlet/order-demo/v1',
    provider: 'mimlet/demo@1',
    configuration: `budget:${budgetCents}`,
  };
}
function arbitrary(budgetCents: number) {
  return scenarioArbitrary(
    fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 6 }),
    (prices) => recipe.override('prices', () => prices),
    { ...identity(budgetCents), seed: 42 }
  );
}

/** A deliberately false business rule demonstrates real shrinking, not a canned animation. */
export function runScenarioDemo(seed = 12345, budgetCents = 40): DemoResult {
  const expected = identity(budgetCents);
  if (!Number.isInteger(seed) || seed < -0x80000000 || seed > 0x7fffffff) {
    throw new RangeError('Demo seed must be a signed 32-bit integer');
  }
  let first: DemoOrder | undefined;
  const report = checkFixtureProperty(
    arbitrary(budgetCents),
    (value) => {
      const valid = value.order.totalCents <= budgetCents;
      if (!valid && !first) {
        first = cloneFixture(value);
      }
      return valid;
    },
    { identity: expected, seed, numRuns: 50, maxSkipsPerRun: 0 }
  );
  const shrunk = report.details.counterexample?.[0];
  return {
    failed: report.details.failed,
    runs: report.details.numRuns,
    shrinks: report.details.numShrinks,
    ...(first ? { first } : {}),
    ...(shrunk ? { shrunk: cloneFixture(shrunk) } : {}),
    ...(report.replay
      ? {
          replay: {
            format: 'mimlet/scenario-demo',
            version: 1,
            budgetCents,
            replay: report.replay,
          },
        }
      : {}),
  };
}

/** The imported record selects only this fixed recipe/property, never executable user code. */
export function replayScenarioDemo(value: unknown): DemoOrder {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('format' in value) ||
    value.format !== 'mimlet/scenario-demo' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('budgetCents' in value) ||
    typeof value.budgetCents !== 'number' ||
    !('replay' in value)
  ) {
    throw new TypeError('Expected a replay record for this scenario demo');
  }
  const budgetCents = value.budgetCents;
  const expected = identity(budgetCents);
  const replay = value.replay as PropertyReplay;
  const report = replayFixtureProperty(
    arbitrary(budgetCents),
    (order) => order.order.totalCents <= budgetCents,
    replay,
    expected
  );
  const order = report.details.counterexample?.[0];
  if (!report.details.failed || !order) {
    throw new Error('Replay did not reproduce the demo failure');
  }
  return cloneFixture(order);
}
