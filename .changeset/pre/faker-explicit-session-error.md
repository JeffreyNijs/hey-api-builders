---
'@mimlet/faker': patch
---

Raise a descriptive `TypeError` when a Faker builder or `fakerAdapter().instance()`
runs without the required explicit session, instead of failing with an opaque
property access error. The check runs before the factory; Faker still has no
default session and its types continue to require one.
