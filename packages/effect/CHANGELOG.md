# Changelog

## 0.1.0-alpha.4

### Patch Changes

- f38ccc6: Target exactly `effect@4.0.0`, which npm now installs by default. Effect 4 removed
  the bundled fast-check, so generation samples Effect's own `effect/Arbitrary` engine
  from the explicit session with every sampling option fixed, and property tests use
  Effect's `Arbitrary.checkEffect` shrinking and replay. Each adapter converts its own
  Standard Schema wrapper, so parse options never leak between adapters or modify the
  caller's schema. Loading this release with Effect 3 throws a `TypeError` naming the
  required version; Effect 3 projects stay on the `0.1.0-alpha.3` train.
- @mimlet/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 5bf6cd2: Raise a descriptive `TypeError` when `fromEffect` or `fromEffectAsync` builds without
  the required explicit session, instead of failing inside native sampling. Effect
  builders still have no default session; the types continue to require one.
- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/effect.

Native schema fixtures preserving input/output semantics and builder capabilities.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
