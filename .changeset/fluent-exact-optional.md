---
'@mimlet/core': patch
---

Type `fluent()` setters with exactly what `.with()` accepts for that field. Under
`exactOptionalPropertyTypes`, an optional key such as `body?: string` no longer accepts
`withBody(undefined)`, which built a present-but-undefined field the type forbids.
Properties that include `undefined` explicitly still accept it.
