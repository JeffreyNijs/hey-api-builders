---
'@mimlet/core': minor
'@mimlet/json-schema': patch
'@mimlet/zod': patch
'@mimlet/arktype': patch
'@mimlet/avro': patch
'@mimlet/protobuf': patch
'@mimlet/graphql': patch
'@mimlet/api': patch
---

Draw session-less list items from one default session instead of repeating the
first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
builders. A single session-less build keeps its seed-1 value, and explicit sessions,
snapshots and replay are unchanged. Factory builders can opt in through the new
type-checked `defaultSession` option.
