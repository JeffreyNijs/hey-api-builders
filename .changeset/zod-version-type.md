---
'@mimlet/zod': patch
---

Type `zodAdapter().metadata.version` as `string`. It reports the loaded Zod release,
but its type was narrowed to the compile-time `4.4.x`, which mistyped Zod 4.5 and 4.6
consumers.
