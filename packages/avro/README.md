# Native Avro fixtures (unreleased)

`avroAdapter(schema, options)` prepares a bounded in-memory Avro schema using
`avsc@5.7.9`. `fromAvro` provides the shared immutable builder. Nothing is loaded
from schema names, file paths, or URLs. Runtime-loaded schemas return `unknown`,
not an invented TypeScript application type.

```ts
import { fromAvro } from '@mimlet/avro';
const events = fromAvro({
  type: 'record',
  name: 'Event',
  fields: [{ name: 'id', type: 'long' }],
});
const event = events.with({ id: 9007199254740993n }).buildValidated();
```

The adapter exposes `create`, `check`, `issues`, `clone`, `encode`, `decode`,
`standard`, `session`, `identity`, `metadata`, and `builder`. The profiles are
`minimal`, `defaults`, `random`, and `boundary`. Generation uses explicit scoped
sessions, never the native library's global random generator. Defaults are fresh
per build, not shared mutable objects. Recursive unions select branches that can
terminate within the depth budget; impossible required recursion fails clearly.

## Representations and validation

Longs are signed 64-bit `bigint` values, with a native low-level long codec so no
intermediate JavaScript number loses precision. Ints remain 32-bit numbers. Float
inputs must already be representable as 32-bit floats (use `Math.fround`);
nonfinite IEEE values remain supported. Bytes and fixed values accept
`Uint8Array` or `Buffer`; cloned/decoded data uses independent `Buffer` instances.
Records are returned as plain objects.

Unions always use explicit branch wrappers, except `null`. For example,
`['int', 'long']` accepts `{ int: 1 }` or `{ long: 1n }`. Named union branches use
fully qualified names. A record field is required even when the schema supplies
a default. Validated builds do not insert fields, drop extras, or coerce input.
Logical types retain their underlying wire representation and are identified as
such in metadata; no Date/decimal conversion is invented. Executable logical-type
hooks are deliberately not read from a schema document.

## Binary and resource boundaries

`encode` and `decode` handle one **raw Avro datum**, not an object container file,
a schema-registry framing protocol, or Avro RPC. Decode rejects trailing bytes.
Before native decoding, a structural scan bounds collection expansion and
recursion, validates UTF-8 and primitive sizes, and checks block lengths. This
prevents a tiny array-of-null payload from allocating billions of values.

Schemas and inputs reject accessors, unexpected class instances, cycles, sparse
arrays, and non-data properties before native processing. Schema node/depth/size,
output node/depth/byte, and collection budgets are configurable. The pinned
native decoder cannot safely retain the `__proto__` map key; this key is rejected
for both input and wire maps instead of silently losing it. Duplicate wire map
keys and unsafe native schema names are also rejected explicitly.

These checks are not an OS sandbox. Native schema compilation still executes
library-generated validation code. Use process isolation for hostile schemas or
strict resource containment. Error paths do not print fixture values; an attached
native cause can contain vendor diagnostics and should be treated accordingly.

The compatibility suite tests actual tarballs, native-encoder agreement, signed
64-bit boundaries, field defaults, unions, recursive fixtures, replay, isolated
values, declaration types, and adversarial binary expansion before decoding.
