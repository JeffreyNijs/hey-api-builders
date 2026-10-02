# Mimlet's ArkType adapter

Introduced in the coordinated toolkit `0.1.0-alpha.1` train.

Native builders for **ArkType 2.2.5**. `fromArkType(schema, options)` generates
encoded input through ArkType's Standard JSON Schema projection and validates
through the original Type. Input/output inference, morphs, brands, defaults,
scoped recursion and native error paths are retained.

See the [executable Zod and ArkType guide](../../docs/zod-and-arktype.md) for tested
recipes and the [compatibility matrix](../../docs/compatibility.md) for version bounds.

## Install

Alpha releases use npm's `next` tag. Pin exact versions when you need to reproduce
fixtures; see [Getting started](../../docs/getting-started.md).

```sh
npm install --save-dev @mimlet/arktype@next arktype@2.2.5
```

## Builders and factories

`.build()` creates input; `.buildValidated()` returns native transformed output.
Use complete `.replace()` values to switch object-union variants. The ordinary
Mimlet configuration, clone policy, list budgets and fluent operations apply.

`fromArkTypeFactory(schema, factory, options)` bypasses JSON conversion and retains
the factory's argument tuple. Known async factories expose async build methods.
Native Date/bigint values and opaque predicates can therefore use explicit factories
while keeping ArkType validation. This does not add asynchronous morph semantics
or a reverse encoder to ArkType.

## Native operations and generation

`arkTypeAdapter(schema, options)` exposes the original `source` and `standard`
handle. `checkInput(value)` delegates to native `allows()` without applying morphs
or output predicates. `decode(input)` delegates to `assert()`. Validated builder
failures retain native issues inside `BuilderValidationError`; thrown callback
errors propagate without retries. Native undeclared-key and cloning policies stay
under the schema's control.

`generation()` prepares and caches the input JSON Schema generator on demand, and
`create(session?)` generates input. Profiles, offline references, budgets and
versioned custom providers use the shared JSON Schema contract. Automatic builders
prepare generation immediately. Unsupported conversion or exhausted sampling
raises an error; a factory supplies data for constraints that cannot be synthesized.

Use `generation().session(seed)` for generator-owned replay identity and keep
application schema/morph versions in the identity when output depends on opaque
functions. The core remains free of vendor dependencies. Native declarations need
DOM and Node types; the schema-free core does not inherit those requirements.
