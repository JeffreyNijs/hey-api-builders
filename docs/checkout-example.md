# Find, shrink, and fix a checkout bug

This executable recipe tests an application mistake: checkout adds each line's
unit price but forgets its quantity. An ordinary one-unit fixture passes. An order
with two units exposes an undercharge.

The complete [typed recipe](../examples/recipes/checkout.ts) runs in the existing
[recipe tests](../examples/recipes.test.mjs), against installed Mimlet tarballs:

```sh
pnpm install --frozen-lockfile
pnpm test:examples
```

The intentionally buggy calculation is checked as an **expected failure**, so the
suite passes only when it finds the bug, reproduces it, and verifies the fix.
This is a business regression example, not a rule that rejects valid large orders.

## 1. Generate orders whose relationships survive shrinking

The scenario declares a customer, independent quantity/price inputs, an order
linked to that customer, and lines linked to that order. fast-check generates and
shrinks only the input items; `scenarioArbitrary` maps each candidate through the
scenario, so every dependent node is rebuilt. Line IDs, foreign keys, quantities,
and prices stay coherent after an item is removed or shrunk. Totals belong to the
application under test, not to the fixture factory.

Inputs contain one to six lines, quantities from 1 to 10, and unit prices from
1 to 10,000 integer cents. Quantity 1 remains in the domain: the generator must
find the bug rather than being handed only failing cases. This deliberately small
model excludes discounts, taxes, shipping, currency conversion, and overflow.

```ts
const result = findCheckoutBug(12345);
// result.first: the first failing order
// result.shrunk: one line, quantity 2, unitPriceCents 1
// buggyCheckoutTotal(result.shrunk) === 1, but the customer owes 2 cents
```

The expected charge is computed independently by adding one unit price for each
unit. The buggy application adds each price just once. The corrected application
multiplies each line's price by its quantity before summing.

## 2. Serialize and reproduce the failure

```ts
const serialized = JSON.stringify(result.replay);
const regression = replayCheckoutBug(JSON.parse(serialized));
```

The record includes the fast-check version, consumer identity, seed, and shrink
path. Replay verifies those fields and reruns the original failing property; it
does not load arbitrary code from JSON. The example keeps the buggy function for
this demonstration only.

The checked-in [regression file](../examples/recipes/checkout-regression.json)
stores both the replay record and the concrete shrunk fixture with its expected
2-cent total. A concrete fixture remains a useful regression even when a future
engine or generator change makes an old seed/path replay incompatible. Do not
silently change identities to force old replay records through validation.

## 3. Check the fix and keep the regression

`checkFixedCheckout(seed)` runs 1,000 generated cases under a new property identity
for the corrected application. The tests inspect relationships on every bug-search
candidate and exercise four seeds. A separate test checks the saved fixture against
its explicit expected total without replay, and verifies that the buggy function
still undercharges it. They also reject malformed or incompatible replay records.

The returned report must be inspected: `details.failed === false` is the pass
condition. In an application test that should fail immediately, use
`assertFixtureProperty` instead of `checkFixtureProperty`.

## What about a manual factory?

See the [tested side-by-side comparison](checkout-comparison.md) for equivalent
manual-factory, native fast-check and Mimlet approaches.

A hand-written factory is perfectly adequate for a small fixed regression:

```ts
const customer = { id: 'customer-1', name: 'Ada' };
const order = { id: 'order-1', customerId: customer.id };
const lines = [{ id: 'line-1', orderId: order.id, quantity: 2, unitPriceCents: 1 }];
```

It still requires someone to choose quantity 2. Native fast-check can also map
and shrink these inputs correctly without Mimlet, rebuilding the relationships on
every shrink with `.map`. Mimlet's contribution here is the named, reusable
dependency recipe and identity-checked replay plumbing. fast-check supplies the
generation, shrinking and seed/path replay underneath.
A generator is not proof of correctness, and these four deterministic seeds are
bounded coverage rather than exhaustive testing.
