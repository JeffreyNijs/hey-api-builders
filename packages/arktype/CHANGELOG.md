# @mimlet/arktype

## 0.1.0-alpha.4

### Patch Changes

- 62e6669: Accept ArkType 2.2.5 through 2.2.7 and Faker 10.5.0 through 10.6.0, each tested
  against the packed adapter. Faker's replay identity now names the loaded Faker
  release instead of always claiming 10.5.0. ArkType exposes no runtime version, so
  `arkTypeAdapter().metadata` reports `supportedVersions` instead of a fixed `version`;
  its generation identity still comes from the converted input schema.
- @mimlet/core@0.1.0-alpha.4
  - @mimlet/json-schema@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 5bf6cd2: Draw session-less list items from one default session instead of repeating the
  first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
  for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
  builders. A single session-less build keeps its seed-1 value, and explicit sessions,
  snapshots and replay are unchanged. Factory builders can opt in through the new
  type-checked `defaultSession` option.
- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3
  - @mimlet/json-schema@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2
  - @mimlet/json-schema@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- 4a915ee: Add dedicated Zod 4 (including Mini) and ArkType adapters with native input/output
  types, JSON Schema input generation, factory helpers and preserved native parsing.
  Zod's explicit async builders avoid the synchronous Standard Schema probe and
  retain native codec encoding. ArkType retains scoped Types and input checks that
  do not execute morphs.

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1
