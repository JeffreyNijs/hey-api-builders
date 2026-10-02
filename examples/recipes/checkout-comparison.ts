import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import {
  buggyCheckoutTotal,
  checkoutTotal,
  expectedCheckoutTotal,
  type Checkout,
  type CheckoutItem,
} from './checkout.js';

/** A plain factory is enough to keep a small graph coherent. No Mimlet API needed. */
export function manualCheckout(items: readonly CheckoutItem[]): Checkout {
  const customer = { id: 'customer-1', name: 'Ada' };
  const order = { id: 'order-1', customerId: customer.id };
  const inputs = items.map((item) => ({ ...item }));
  const lines = inputs.map((item, index) => ({
    id: `line-${index + 1}`,
    orderId: order.id,
    ...item,
  }));
  return { customer, items: inputs, order, lines };
}

/** A deterministic regression catches the same bug without any generated search. */
export function checkManualCheckoutRegression(): Checkout {
  const checkout = manualCheckout([{ quantity: 2, unitPriceCents: 1 }]);
  assert.equal(expectedCheckoutTotal(checkout), 2);
  assert.equal(buggyCheckoutTotal(checkout), 1);
  assert.equal(checkoutTotal(checkout), 2);
  return checkout;
}

// Exactly the same independent input domain as checkout.ts. Native .map rebuilds
// the whole graph on each shrink; relationship-preserving shrinking is not unique
// to Mimlet. Keep this mapper deterministic and free of external mutable state.
export const nativeCheckouts = fc
  .array(
    fc.record({
      quantity: fc.integer({ min: 1, max: 10 }),
      unitPriceCents: fc.integer({ min: 1, max: 10_000 }),
    }),
    { minLength: 1, maxLength: 6 }
  )
  .map(manualCheckout);

export interface NativeCheckoutReplay {
  readonly seed: number;
  readonly path: string;
  readonly endOnFailure: true;
}

const nativeBugProperty = fc.property(
  nativeCheckouts,
  (checkout) => buggyCheckoutTotal(checkout) === expectedCheckoutTotal(checkout)
);

/** Native fast-check provides both shrinking and seed/path replay. */
export function findNativeCheckoutBug(seed = 12345) {
  const details = fc.check(nativeBugProperty, { seed, numRuns: 100, maxSkipsPerRun: 0 });
  const replay: NativeCheckoutReplay | undefined =
    details.failed && details.counterexamplePath !== null
      ? { seed: details.seed, path: details.counterexamplePath, endOnFailure: true }
      : undefined;
  return { details, replay };
}

/** Use a trusted record with the same fast-check version, arbitrary, and property. */
export function replayNativeCheckoutBug(replay: NativeCheckoutReplay): Checkout {
  const details = fc.check(nativeBugProperty, { ...replay, numRuns: 100, maxSkipsPerRun: 0 });
  const checkout = details.counterexample?.[0];
  if (!details.failed || !checkout) {
    throw new Error('Native replay did not reproduce the checkout bug');
  }
  return checkout;
}

export function checkNativeFixedCheckout(seed = 12345) {
  return fc.check(
    fc.property(
      nativeCheckouts,
      (checkout) => checkoutTotal(checkout) === expectedCheckoutTotal(checkout)
    ),
    { seed, numRuns: 1000, maxSkipsPerRun: 0 }
  );
}
