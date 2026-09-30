# Changelog

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
