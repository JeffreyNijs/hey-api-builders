---
'hey-api-builders': patch
---

Generate `withX()` helpers for model properties that come from `allOf` members and
references, as response builders already did. `oneOf`/`anyOf` models still get none,
because a shared discriminant setter would allow a partial variant transition.
