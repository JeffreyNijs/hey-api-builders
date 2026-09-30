# Native Effect fixtures (unreleased)

This package targets `effect@3.22.2`. Effect 4 has a different native Arbitrary API
and is not silently treated as compatible. Native Effect 3 schema generation and
shrinking use its own fast-check 3 dependency, not an unverified conversion to the
separately tested fast-check 4 adapter.

```ts
import * as S from 'effect/Schema';
import { createSession } from 'mimlet';
import { fromEffect } from '@mimlet/effect';
const schema = S.Struct({ age: S.NumberFromString });
const session = createSession({ seed: 123, fingerprint: 'person/v1', provider: 'effect@3.22.2' });
const people = fromEffect(schema);
const input = people.with({ age: '42' }).build(session);
const output = people.with({ age: '42' }).buildValidated(session);
```

A native arbitrary generates a **decoded output** and the original encoder turns
it into fixture input. This retains native declarations and transformation rules
instead of forcing them through JSON. `fromEffectAsync` uses the native asynchronous
encoder; `fromEffectFactory` accepts an explicit input factory for one-way codecs,
unsupported arbitrary derivations and application-specific fixture logic.

`effectAdapter` exposes the original source, native Standard Schema validation,
input/output checks, sync/async encode/decode, and native input/output arbitraries.
Input checking checks the encoded shape, not the success of a subsequent decode.
Input-arbitrary shrinking re-encodes each native output shrink. Transformations
and arbitrary annotations must remain pure and terminating for property testing.
Encoding failures propagate, not trigger hidden retries. Validation invokes the
native Standard Schema entry once per validated build, after builder overrides.
The original schema owns parsing behavior; excess object properties default to
errors and can be configured through `parseOptions`.

Schemas requiring Effect services are not accepted by these constructors; provide
services in your own factory/validation wrapper. This restriction is type-tested.
Async schema execution is supported through async build methods, not detected by
inspecting private AST nodes. Native failures and issues remain available and may
contain application values; no reports are logged or transmitted by this package.

Sessions are explicit and caller-versioned: include the schema, annotations,
codec behavior and native dependency versions in your replay identity. Modified
native fast-check global configuration is rejected for deterministic sampling.
The adapter does not modify native configuration. Native schemas/annotations are
trusted code; this is not an interruptible worker or a guarantee of arbitrary
termination for opaque user filters.

Native peer declarations use Web platform types. Their compatibility consumers
include DOM types (and Node types for ArkType); this does not add DOM dependencies
to the schema-free core. The pinned Zod Standard Schema implementation probes
async refinements synchronously before retrying them asynchronously. The generic
standards path calls its validator entry once but does not override that native
behavior. Use an explicit `safeParseAsync` validation wrapper for effectful Zod
refinements that must not be probed twice.
