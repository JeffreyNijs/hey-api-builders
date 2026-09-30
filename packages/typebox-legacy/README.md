# Legacy TypeBox builders (unreleased)

`@mimlet/typebox-legacy` is the native adapter for `@sinclair/typebox`. Its prepared alpha is unpublished. The current compatibility target is exactly `@sinclair/typebox@0.34.52`; this does not claim compatibility with every 0.x release.

```ts
import { Type } from '@sinclair/typebox';
import { fromTypeBox } from '@mimlet/typebox-legacy';

const Timestamp = Type.Transform(Type.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const events = fromTypeBox(Type.Object({ timestamp: Timestamp }));

const input = events.with({ timestamp: 1000 }).build();
const output = events.with({ timestamp: 1000 }).buildValidated();
// input.timestamp is a number; output.timestamp is a Date.
```

## Contract

The exported functions are `fromTypeBox`, `fromTypeBoxFactory`, and `typeBoxAdapter`, as in the modern adapter. All builders use the same core runtime, preserve factory argument tuples and encoded/decoded types, and restrict known-asynchronous factories to asynchronous build methods.

Automatic creation delegates to native `Value.Create`, clones its result, and checks it. This constructs native defaults/minimal examples, not random data. Unsupported creation raises `BuilderGenerationError` with a cause; `fromTypeBoxFactory(schema, factory, options)` supplies application-specific data instead. There is no unbounded retry loop, no assertion that every satisfiable schema can be generated, and no silent repair of invalid overrides.

The adapter's `check` uses native checking without coercion. Successful validation calls native `Value.Decode` on a clone. In this package line, Decode checks the encoded value and executes Transform callbacks without the modern default/convert/clean pipeline. A codec executes once per validated build, although the legacy implementation may perform more than one native check. `encode` calls the native encoder, which checks the encoded result. Native callback failures are preserved.

## References and native values

Legacy external references are supplied explicitly:

```ts
const User = Type.Object({ id: Type.String() }, { $id: 'User' });
const users = fromTypeBox(Type.Ref(User), { references: [User] });
```

The reference array is copied, but schemas remain caller-owned. Native recursive schemas, Date schemas, Transform callbacks, and registered formats are not serialized through JSON. The conformance suite exercises representative cases, including Date output, recursive trees with empty child arrays, and custom formats.

Neither the adapter nor the core downloads references or changes global format/type registries. Custom types still need appropriate native registration and may require an explicit factory. Native generation is intended for trusted schemas: the core's list budget does not isolate recursive generation, expensive regexes, or user code.

See the modern adapter README for the shared API details and the root `docs/acceptance.md` for the implementation and acceptance boundaries. Run `pnpm test:typebox` to test both package lines using real independently installed tarballs and strict declaration checks.

## Complete union variants

`fromTypeBoxVariant(union, index, options)` constructs an entire selected top-level
`anyOf` branch before applying patches. Input types are narrowed to that branch;
validation and output retain the original union and its root codecs.
`typeBoxVariantAdapter` exposes native checking, issues, creation, decoding and
encoding for that selection. Use `createSchemaBuilder(adapter.standard, factory)`
for a custom factory. See the repository's `docs/union-variants.md` for the full
contract and overlap/reference caveats.
