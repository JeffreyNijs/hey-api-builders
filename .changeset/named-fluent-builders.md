---
'@mimlet/core': minor
---

Add `fluent(builder, fields)` for opt-in, input-typed named setters across factory
and native schema builders. Explicit field tuples and method aliases retain factory
arguments, immutable branches, native validation and async capability transitions.
Configuration never invokes factories to discover fields. Ambiguous names and
capability collisions are rejected instead of overriding existing methods.
