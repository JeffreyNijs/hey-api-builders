---
'@mimlet/effect': patch
---

Raise a descriptive `TypeError` when `fromEffect` or `fromEffectAsync` builds without
the required explicit session, instead of failing inside native sampling. Effect
builders still have no default session; the types continue to require one.
