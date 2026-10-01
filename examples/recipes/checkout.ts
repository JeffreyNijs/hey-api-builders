import * as fc from 'fast-check';
import { cloneFixture, createScenario } from '@mimlet/core';
import { checkFixtureProperty, replayFixtureProperty, scenarioArbitrary } from '@mimlet/fast-check';
import type { PropertyReplay } from '@mimlet/fast-check';

export interface CheckoutItem {
  readonly quantity: number;
  readonly unitPriceCents: number;
}

const recipe = createScenario({ name: 'checkout' })
  .node('customer', [], () => ({ id: 'customer-1', name: 'Ada' }))
  .node('items', [], () => [] as CheckoutItem[])
  .node('order', ['customer'], ({ customer }) => ({
    id: 'order-1',
    customerId: customer.id,
  }))
  .node('lines', ['order', 'items'], ({ order, items }) =>
    items.map((item, index) => ({
      id: `line-${index + 1}`,
      orderId: order.id,
      ...item,
    }))
  );

export type Checkout = ReturnType<typeof recipe.build>;

/** Application bug: a line with three units is charged as if it had one. */
export function buggyCheckoutTotal(checkout: Checkout): number {
  return checkout.lines.reduce((total, line) => total + line.unitPriceCents, 0);
}

/** The fix: all amounts stay in integer cents; charge each unit in each line. */
export function checkoutTotal(checkout: Checkout): number {
  return checkout.lines.reduce((total, line) => total + line.quantity * line.unitPriceCents, 0);
}

/** Independent oracle: expand quantities into individual units and add their prices. */
export function expectedCheckoutTotal(checkout: Checkout): number {
  let total = 0;
  for (const line of checkout.lines) {
    for (let unit = 0; unit < line.quantity; unit++) {
      total += line.unitPriceCents;
    }
  }
  return total;
}

const buggyIdentity = {
  fingerprint: 'mimlet/checkout/v1',
  provider: 'checkout-example@1',
  configuration: 'total:omits-quantity',
};
const fixedIdentity = { ...buggyIdentity, configuration: 'total:includes-quantity' };

// Only independent inputs shrink. Each candidate rebuilds the customer/order/line links.
// Quantity 1 is legal: the generator must discover quantities that expose the bug.
const checkouts = scenarioArbitrary(
  fc.array(
    fc.record({
      quantity: fc.integer({ min: 1, max: 10 }),
      unitPriceCents: fc.integer({ min: 1, max: 10_000 }),
    }),
    { minLength: 1, maxLength: 6 }
  ),
  (items) => recipe.override('items', () => items),
  { ...buggyIdentity, seed: 'checkout-fixtures' }
);

export interface CheckoutReplay {
  readonly format: 'mimlet/checkout-example';
  readonly version: 1;
  readonly replay: PropertyReplay;
}

/** Inspect the expected failure rather than deliberately failing the example test suite. */
export function findCheckoutBug(seed = 12345, onCandidate?: (checkout: Checkout) => void) {
  let first: Checkout | undefined;
  let observationError: { cause: unknown } | undefined;
  const report = checkFixtureProperty(
    checkouts,
    (checkout) => {
      // Diagnostics cannot mutate fixtures or turn their own errors into business failures.
      if (onCandidate && !observationError) {
        try {
          onCandidate(cloneFixture(checkout));
        } catch (cause) {
          observationError = { cause };
        }
      }
      const valid = buggyCheckoutTotal(checkout) === expectedCheckoutTotal(checkout);
      if (!valid && !first) {
        first = cloneFixture(checkout);
      }
      return valid;
    },
    { identity: buggyIdentity, seed, numRuns: 100, maxSkipsPerRun: 0 }
  );
  if (observationError) {
    throw observationError.cause;
  }
  const shrunk = report.details.counterexample?.[0];
  const replay: CheckoutReplay | undefined = report.replay
    ? { format: 'mimlet/checkout-example', version: 1, replay: report.replay }
    : undefined;
  return {
    failed: report.details.failed,
    runs: report.details.numRuns,
    shrinks: report.details.numShrinks,
    first,
    shrunk: shrunk ? cloneFixture(shrunk) : undefined,
    replay,
  };
}

/** Only replays this versioned bug/property; imported JSON never selects executable code. */
export function replayCheckoutBug(value: unknown): Checkout {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('format' in value) ||
    value.format !== 'mimlet/checkout-example' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('replay' in value)
  ) {
    throw new TypeError('Expected a checkout example replay record');
  }
  const report = replayFixtureProperty(
    checkouts,
    (checkout) => buggyCheckoutTotal(checkout) === expectedCheckoutTotal(checkout),
    value.replay as PropertyReplay,
    buggyIdentity
  );
  const checkout = report.details.counterexample?.[0];
  if (!report.details.failed || !checkout) {
    throw new Error('Replay did not reproduce the checkout bug');
  }
  return cloneFixture(checkout);
}

/** A changed application uses a new property identity, not the old bug's replay identity. */
export function checkFixedCheckout(seed = 12345) {
  return checkFixtureProperty(
    checkouts,
    (checkout) => checkoutTotal(checkout) === expectedCheckoutTotal(checkout),
    { identity: fixedIdentity, seed, numRuns: 1000, maxSkipsPerRun: 0 }
  );
}
