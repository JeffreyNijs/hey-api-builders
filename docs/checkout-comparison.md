# The same checkout bug, three ways

A checkout forgets to multiply a line's unit price by its quantity. This comparison
uses the [same application, fix, and independent oracle](../examples/recipes/checkout.ts)
for all three approaches. The oracle adds one unit price for each unit; the fix
multiplies quantity by price. All amounts are integer cents.

The [executable comparison](../examples/recipes/checkout-comparison.ts) and
[recipe tests](../examples/recipes.test.mjs) run with `pnpm test:examples` against
isolated Mimlet package tarballs. No extra dependency is required: the consumer
already pins fast-check 4.10.2. These are correctness examples, not benchmarks.

## 1. Plain factory and a fixed regression

`manualCheckout(items)` builds the customer, order, and lines with explicit foreign
keys. The deterministic test needs just one chosen case:

```ts
const checkout = manualCheckout([{ quantity: 2, unitPriceCents: 1 }]);
assert.equal(expectedCheckoutTotal(checkout), 2);
assert.equal(buggyCheckoutTotal(checkout), 1);
assert.equal(checkoutTotal(checkout), 2);
```

This catches the exact bug without a generator or shrinker. It is often enough for
a known regression or a handful of readable cases. Someone must choose the cases;
a one-unit fixture would pass even with this bug. A concrete regression is also
independent of future changes to a generator's seed/path behavior.

## 2. Native fast-check with a relationship-preserving map

The native example feeds the factory from independent inputs:

```ts
const nativeCheckouts = fc
  .array(
    fc.record({
      quantity: fc.integer({ min: 1, max: 10 }),
      unitPriceCents: fc.integer({ min: 1, max: 10_000 }),
    }),
    { minLength: 1, maxLength: 6 }
  )
  .map(manualCheckout);
```

Native `.map` rebuilds the whole graph for each candidate, including shrinking.
Customer/order/line links remain coherent. There is no need to generate foreign
keys independently and reject broken combinations. This is a fair alternative to
Mimlet for a small pure graph; relationship-preserving shrinking is not exclusive
to Mimlet.

`findNativeCheckoutBug(seed)` uses `fc.check(fc.property(...))` to inspect the
expected failure without failing the demonstration suite. Native fast-check also
provides replay:

```ts
const { details, replay } = findNativeCheckoutBug(12345);
const reproduced = replayNativeCheckoutBug(JSON.parse(JSON.stringify(replay)));
```

The helper calls the same property with fast-check's `seed`, `path`, and
`endOnFailure: true`. Keep the engine version, arbitrary, and property unchanged
for meaningful replay. This small helper accepts a trusted typed record; it is
not an untrusted replay-file validator. Applications can add their own version
and identity checks around native replay.

## 3. Mimlet's scenario recipe and replay wrapper

The [Mimlet recipe](checkout-example.md) declares named customer, items, order, and
lines nodes with their dependencies. `scenarioArbitrary` maps the same input
domain into that recipe, overriding the independent items and rebuilding the
dependent nodes for each shrink. It uses fast-check for generation and shrinking.

```ts
const result = findCheckoutBug(12345);
const reproduced = replayCheckoutBug(JSON.parse(JSON.stringify(result.replay)));
```

Here the extra layer provides a reusable named dependency recipe and an
identity-checked replay envelope. The replay includes the engine version and
consumer-supplied fingerprint, provider, and configuration. These identifiers
must honestly track changes; they are not automatic hashes of application code.
This can be useful when a team already uses scenarios across tests or needs a
consistent replay convention. It also adds APIs, dependencies, and identity
maintenance compared with a direct factory or native fast-check setup.

## What the executable checks establish

Both generated examples use one to six lines, quantities 1–10, unit prices
1–10,000, the same buggy function and oracle, 100 search runs, and zero allowed
skips. The fixed properties each use 1,000 runs. The tests exercise seeds 12345,
1, 42, and 100 and inspect every bug-search candidate's constraints and links.

For these seeds and the pinned engine, both generated approaches discover and
shrink to the same fixture: one line, quantity 2, price 1 cent. The buggy total is
1 cent and the correct total is 2 cents. Both serialize and replay their failure.
The plain factory constructs this same regression directly. Passing generated
checks is bounded evidence, not proof; the model excludes discounts, taxes,
shipping, currency conversion, and overflow. No speed, coverage, or uniqueness
advantage is established by this example.

## Choosing the smallest useful tool

- Use a plain factory and explicit assertions when the important cases are known
  and the graph is easy to maintain
- Add native fast-check when you want generated exploration and shrinking and a
  pure mapping expresses the relationships clearly
- Consider Mimlet when reusable named scenarios and a shared identity/replay
  convention justify an additional abstraction

The defensible claim is that Mimlet packages scenario composition and replay
conventions around fast-check. It does not make this bug impossible to catch
with ordinary tests or make coherent shrinking unavailable without Mimlet.
