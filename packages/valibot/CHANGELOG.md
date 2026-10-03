# Changelog

## 0.1.0-beta.0

### Patch Changes

- eba145d: Add `valibotAdapter(schema, options).generation()`, the JSON Schema generator that
  session-less `fromValibot` builds use, with its `session()` and `identity`, as ArkType
  and Zod already expose. `buildList(n)` now provably equals
  `buildList(n, valibotAdapter(schema).generation().session())`, matching the sessions guide.
- Updated dependencies
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0
  - @mimlet/json-schema@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4
  - @mimlet/json-schema@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3
  - @mimlet/json-schema@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2
  - @mimlet/json-schema@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/valibot.

Native schema fixtures preserving input/output semantics and builder capabilities.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
