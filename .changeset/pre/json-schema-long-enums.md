---
'@mimlet/json-schema': patch
---

Generate every value of a string `enum` or `const`. A 16-character sampling hint for
unbounded strings also applied to enums, so longer values were never generated and a
single long value (a typical event type or discriminator) failed with
`SCHEMA_GENERATION_FAILED`. An explicit `maxLength` still applies. Saved sessions for
such schemas can now produce the previously missing values.
