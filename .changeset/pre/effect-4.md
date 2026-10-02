---
'@mimlet/effect': patch
---

Target exactly `effect@4.0.0`, which npm now installs by default. Effect 4 removed
the bundled fast-check, so generation samples Effect's own `effect/Arbitrary` engine
from the explicit session with every sampling option fixed, and property tests use
Effect's `Arbitrary.checkEffect` shrinking and replay. Each adapter converts its own
Standard Schema wrapper, so parse options never leak between adapters or modify the
caller's schema. Loading this release with Effect 3 throws a `TypeError` naming the
required version; Effect 3 projects stay on the `0.1.0-alpha.3` train.
