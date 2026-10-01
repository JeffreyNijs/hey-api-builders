# Zod and ArkType builders

The dedicated `@mimlet/zod` and `@mimlet/arktype` packages are published in
`0.1.0-alpha.2` on npm's `next` channel. Existing Standard Schema and Standard JSON
Schema entry points remain supported. Install the adapter you use, with its tested peer:

```sh
# Zod, including Zod Mini
npm install --save-dev @mimlet/zod@0.1.0-alpha.2 zod@4.4.3

# ArkType
npm install --save-dev @mimlet/arktype@0.1.0-alpha.2 arktype@2.2.5
```

## Zod: typed input, native output

<!-- recipe:zod -->

The encoded age is a string. Native validation produces a number. The original
schema keeps control over coercion, defaults, object stripping and codec behavior.
Zod Mini is supported through the same native Zod core API.

For async refinements or codecs, choose `fromZodAsync` or
`fromZodFactoryAsync`. They go directly through native async parsing; the pinned
Standard Schema implementation's sync probe is not repeated. Their builders expose
async methods only. Ordinary async input factories with synchronous schemas can
also use `fromZodFactory`.

Use `zodAdapter(schema)` when you need direct decode/encode operations or access to
the generation engine. One-way transforms keep Zod's native encoding failure.
See the [Zod package contract](../packages/zod/README.md).

## ArkType: preserve morphs and scopes

<!-- recipe:arktype -->

ArkType's original Type remains the validator. Its `allows()` input check does not
execute morphs; validated builds do. Scoped and recursive Types retain their input
and output types. Undeclared keys follow the schema's own ignore/reject/delete policy.

`fromArkTypeFactory` retains factory arguments and supports asynchronous input
production. It does not invent inverse morphs or a native asynchronous parser.
See the [ArkType package contract](../packages/arktype/README.md).

## Use factories for native values and domain constraints

Automatic generation is bounded sampling of converted input metadata. It can handle
the shared generator's supported profiles and constraints; it does not solve every
refinement. Native validation remains authoritative when a refinement cannot be
represented. Conversion and sampling failures stay visible.

Factories do not require conversion, so schemas involving Date, bigint, custom
predicates or application-owned objects can retain their native behavior. Keep the
schema and supply meaningful input through `fromZodFactory`,
`fromZodFactoryAsync` or `fromArkTypeFactory`.

For replay, preserve the generator identity and the application's schema/codec
version. The existing [scenario](correlated-scenarios.md),
[replay](sessions-and-replay.md) and [property-testing](../packages/fast-check/README.md)
contracts work with these builders.

The examples above are compiled and executed against isolated package tarballs by
`pnpm test:examples`; `pnpm test:optional` also runs native conformance, negative
type checks and coverage for both adapters.
