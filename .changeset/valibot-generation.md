---
'@mimlet/valibot': patch
---

Add `valibotAdapter(schema, options).generation()`, the JSON Schema generator that
session-less `fromValibot` builds use, with its `session()` and `identity`, as ArkType
and Zod already expose. `buildList(n)` now provably equals
`buildList(n, valibotAdapter(schema).generation().session())`, matching the sessions guide.
