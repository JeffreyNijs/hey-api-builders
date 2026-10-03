# Changelog

## 0.1.0-beta.0

### Patch Changes

- Promote the coordinated train from alpha to beta for structured evaluation. The beta
  scope, known limits and feedback workflows are recorded in the beta readiness checklist.
- eba145d: Type `fluent()` setters with exactly what `.with()` accepts for that field. Under
  `exactOptionalPropertyTypes`, an optional key such as `body?: string` no longer accepts
  `withBody(undefined)`, which built a present-but-undefined field the type forbids.
  Properties that include `undefined` explicitly still accept it.

## 0.1.0-alpha.4

No changes in this release.

## 0.1.0-alpha.3

### Minor Changes

- 5bf6cd2: Draw session-less list items from one default session instead of repeating the
  first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
  for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
  builders. A single session-less build keeps its seed-1 value, and explicit sessions,
  snapshots and replay are unchanged. Factory builders can opt in through the new
  type-checked `defaultSession` option.

## 0.1.0-alpha.2

### Minor Changes

- 7fbd5f2: Add `fluent(builder, fields)` for opt-in, input-typed named setters across factory
  and native schema builders. Explicit field tuples and method aliases retain factory
  arguments, immutable branches, native validation and async capability transitions.
  Configuration never invokes factories to discover fields. Ambiguous names and
  capability collisions are rejected instead of overriding existing methods.

## 0.1.0-alpha.1

Version aligned with the coordinated Zod and ArkType adapter release; no core runtime changes.

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/core.

Schema-independent immutable test-data builders with Standard Schema validation.

Validation failures expose a stable `VALIDATION_FAILED` code and a generic message.
Native diagnostics remain available through the non-enumerable `error.issues` property.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
