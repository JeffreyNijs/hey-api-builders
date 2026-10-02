# Changelog

## 0.1.0-alpha.3

### Patch Changes

- 21ef5a9: Raise a descriptive `TypeError` when a Faker builder or `fakerAdapter().instance()`
  runs without the required explicit session, instead of failing with an opaque
  property access error. The check runs before the factory; Faker still has no
  default session and its types continue to require one.
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

- Add deterministic, locale-aware Faker factories and Standard Schema validation.
