---
'@mimlet/core': patch
'@mimlet/adapter': patch
---

Validation failures now expose a stable `VALIDATION_FAILED` code and a generic
message. Native messages and paths remain available through `error.issues`, which
is no longer enumerable. Consumers that intentionally display native diagnostics
should read that property explicitly instead of parsing `error.message`.

The adapter conformance API now accepts adapters that declare generation or other
capabilities without a separate pure input checker.
