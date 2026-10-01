# Watch a failure shrink

An order belongs to a customer. Its lines belong to that order, and its total must
equal the sum of the line prices. Those relationships should survive shrinking.

This demo tests a deliberately false rule: **every order fits the selected
budget**. Find an order that breaks it, reveal the real shrink result, then replay
that failure. Change the seed or budget to explore a different run.

<!-- interactive:scenario -->

## What actually runs

The website executes the [tested scenario recipe](../examples/recipes/scenario-demo.ts)
using `createScenario`, `scenarioArbitrary`, `checkFixtureProperty` and
`replayFixtureProperty`. The same recipe is compiled and tested against clean
package tarballs by `pnpm test:examples`.

The arbitrary produces one to six line prices between 1 and 100 cents. It makes
at most 50 property checks before shrinking a failure. Each shrink rebuilds the
customer, order and lines from the reduced prices. No requests leave the browser,
and the demo runs a fixed recipe rather than arbitrary uploaded JavaScript.

The shrink result is the result of this search, not a guarantee of a globally
smallest counterexample. A passing bounded run does not prove a rule correct.
Replay checks the recipe, budget, provider and engine identities before reusing
the recorded seed and shrink path. Changing the budget invalidates an old replay.

## Use the same pattern in a test

<!-- recipe:shrinking -->

Continue with [correlated scenarios](correlated-scenarios.md),
[sessions and replay](sessions-and-replay.md), or the
[fast-check reference](../packages/fast-check/README.md).
