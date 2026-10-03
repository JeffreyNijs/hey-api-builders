---
'@mimlet/api': patch
---

Honour `readOnly` and `writeOnly` written beside `$ref` in OpenAPI 3.1, as other `$ref`
siblings already were. Request fixtures and checks no longer require server-assigned
fields declared as `{ $ref, readOnly: true }`, and response checks drop `writeOnly` ones.
OpenAPI 3.0 still ignores `$ref` siblings, as its specification requires.
