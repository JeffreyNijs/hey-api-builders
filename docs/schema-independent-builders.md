# Schema-independent builders: architecture and migration

## Repository decision

Keep one repository with independently packable, neutrally named packages. The existing `hey-api-builders` npm package remains the compatibility integration. Do not rename the repository, publish a new package, or migrate existing consumers as a side effect of an implementation PR.

Current packages are private and unreleased:

- `packages/test-builders`: shared immutable execution runtime and Standard Schema support.
- `packages/test-builders-typebox`: native modern TypeBox creation, strict checking, and codecs.
- `packages/test-builders-typebox-legacy`: native maintained legacy TypeBox support.

A full workspace and package-aware release process are still required before publication. The isolated consumer tests prove these package boundaries without allowing undeclared monorepo dependencies to conceal packaging errors.

## Implemented behavior

The core separates public capability types from one execution runtime. It preserves factory argument tuples, distinguishes synchronous and asynchronous factories, supports synchronous and explicitly asynchronous transforms, and carries Standard Schema input/output types through validation. It has record-only merging, conservative full replacement for object unions, per-build overrides, optional omission, list budgets, and operation-only descriptions.

The native adapters retain original schema objects and use native operations. Modern TypeBox's default decode pipeline can normalize data; the adapter instead checks encoded input and then applies only codec callbacks to a clone. Legacy Decode has a different pipeline and is handled separately. No adapter serializes codecs or native types through JSON merely to share a generator.

Native automatic creation is a limited defaults/minimal-example provider. It is not seeded random generation or a universal solver. Failure retains its cause and offers a custom factory rather than inventing a validity guarantee.

## One runtime, rich adapters

The architectural rule is capability preservation. Typed factories, Standard Schema validators, Standard JSON Schema conversion, and native adapters are complementary inputs. Standard Schema alone supplies no generation algorithm. A native adapter can retain capabilities that are absent from a JSON representation.

The canonical Standard interfaces are vendored as type-only code with their license. Vendoring avoids a runtime dependency and allows isolated offline core testing; it requires periodic parity checks against the upstream spec. Native adapters remain separate packages with explicitly tested peer versions.

## Existing Hey API compatibility

The old plugin continues to emit its existing self-contained runtime. This PR does not claim its generated classes have acquired the new core's guards or methods. Adopting the new runtime requires a deliberate packaging and versioning step, with the existing generation/compilation/behavior tests as acceptance gates.

Imported runtime output should be the default future codegen mode. An optional self-contained mode must be generated from the same canonical implementation, never maintained as a second handwritten runtime. Arbitrary closures or native schema callbacks cannot simply be serialized; such consumers need imports or a documented limitation.

## Trust and correctness boundaries

Factories, schemas, registries, codecs, and callback implementations remain trusted application code. List budgets do not sandbox native recursion or regex execution. Runtime schema validation is explicit; typed unchecked fixtures are not automatically valid against refinements. Native callback failures are not a reason to repair or retry user overrides.

Compile-time union restrictions prevent common incomplete-variant patches, but erased runtime types cannot be reconstructed. Raw JSON inputs, validation-aware variant selection, sandboxed execution, and per-operation generation budgets require additional work.

See `product-roadmap.md` for the accepted long-term scope and its release gates. Package READMEs describe implemented APIs; roadmap entries are not promises of current support.
