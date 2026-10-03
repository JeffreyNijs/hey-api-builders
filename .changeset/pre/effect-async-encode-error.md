---
'@mimlet/effect': patch
---

Raise a `TypeError` that points to `fromEffectAsync` when a synchronous build or
`inputArbitrary()` meets an asynchronous encoder, instead of Effect's internal
"Sync adapter can only throw schema errors". Ordinary schema failures still surface as
Effect's `SchemaError`. Exhausted sampling now suggests `fromEffectFactory`.
