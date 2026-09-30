# Sessions and replay

A builder is an immutable recipe. A generation session owns mutable execution
state for one test or scenario. Never share a session across independent tests.

```ts
import { createBuilder, createSession, restoreSession } from '@jeffreynijs/test-builders';
import type { GenerationSession } from '@jeffreynijs/test-builders';

const identity = {
  fingerprint: 'users/v1',
  provider: 'application-fixtures@1',
  configuration: 'adults',
};
const session = createSession({ ...identity, seed: 'regression-123' });
const users = createBuilder((session: GenerationSession) => ({
  id: session.sequence('user-id', 1),
  age: session.scope('age').integer(18, 80),
}));

const before = session.snapshot();
const original = users.buildList(3, session);
const replay = restoreSession(JSON.parse(JSON.stringify(before)), identity);
const repeated = users.buildList(3, replay);
// original and repeated contain the same values.
```

Scopes are shared views into a session: repeated `scope('age')` calls continue
that named stream. Different scope paths do not consume each other's counters.
Numeric and string names, negative zero, and names containing separators remain
distinct across JSON round-trips. There is no process-global RNG or ambient clock.
`referenceDate()` returns a fresh Date at the configured canonical ISO UTC time;
the default is `2000-01-01T00:00:00.000Z`.

The public operations are `scope`, `random`, inclusive `integer`, `boolean`,
`pick`, `sequence`, `unique`, `referenceDate`, and `snapshot`. Integer generation
uses rejection sampling, not modulo-biased range reduction. Scopes are limited
to 64 components and components to 4096 characters. The generator is for fixture
variation, not secrets, cryptographic use, or guaranteed non-overlapping streams.

`unique(name, factory, { keyOf, attempts })` is synchronous and session-scoped.
Primitive values work directly; objects require a primitive key from `keyOf`.
Duplicate attempts consume the operation budget. Failed generation is not proof
that the domain is empty. Defaults limit operations to 1,000,000, tracked keys
to 10,000, stored unique values to 100,000, and attempts per unique value to 100.
Limits are explicit session configuration and are retained by replay.

Take a snapshot **before** the operation to reproduce it, or afterward to resume
subsequent generation. Snapshots copy RNG positions, sequence state, uniqueness
keys, reference time, budgets, and the scope. Consumers must assert the same
fingerprint, provider/version, and configuration when restoring. These identities
are supplied by the application; the library cannot fingerprint an arbitrary
closure or make global third-party randomness replayable. Snapshots are not
cryptographically authenticated, and uniqueness keys can contain sensitive data.
Treat saved replays like fixtures; nothing is transmitted by the library.

Only randomness and state accessed through the session receive these guarantees.
Async callers must establish ordering themselves; automatic parallel execution,
fixture capture, and provider-derived fingerprints are separate capabilities.
