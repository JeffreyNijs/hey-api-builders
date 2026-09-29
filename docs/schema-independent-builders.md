# Evolve the repository, separate the packages

## Decision

Keep this repository and add a neutrally named, independently packable builder
core under `packages/test-builders`. Keep the root `hey-api-builders` package as
the existing Hey API integration. Do not rename the repository, publish a new
package, change the existing default export, or migrate consumers in this PR.

The package name `@jeffreynijs/test-builders` is provisional; `private: true`
prevents accidental publication. The core can be built and installed from a local
tarball without Hey API, Faker, Zod or the repository's development dependencies.

A new repository would duplicate release infrastructure and make it harder to
run the existing integration's regression tests alongside core changes. A
separate package is the useful dependency boundary; it does not require a
separate Git repository. The repository itself can be renamed after the neutral
API and package name are settled.

## Implemented here

- A small dependency-free TypeScript runtime for immutable factory builders.
- Standard Schema v1 input/output inference and opt-in validation.
- Synchronous and asynchronous factories/validation, sequential lists, and
  preserved factory argument types.
- Record-only shallow merging, atomic non-JSON values, explicit replacement,
  and regression tests for Date/Map/class-instance handling.
- Independent runtime/type tests plus real Zod interoperability tests in CI.

See [the core README](../packages/test-builders/README.md) for the API and precise
support contract. A validator and a factory are still required for validated
fixtures; universal schema-only generation is not implemented.

## Deliberate compatibility boundary

This is the first implementation slice, not a completed rewrite of the Hey API
emitter. The old plugin still emits its existing self-contained builder code;
it does not import this unpublished package. Its source and generated API are
unchanged by this PR. Consequently, the new non-record guards apply to the new
core, not retroactively to previously generated Hey API builders.

Making the old emitter a thin adapter is the next extraction step. Before doing
that, decide whether generated clients should import a published core or retain
an inlined runtime. Importing an unpublished package would break consumers;
maintaining two subtly different runtimes indefinitely would also be undesirable.
The old end-to-end suite remains the migration acceptance test.

## Subsequent scope

1. Adopt the core in the Hey API emitter with a tested packaging strategy and
   explicitly handle any generated API changes.
2. Add a separate schema-to-factory provider, preferably through Standard JSON
   Schema where available. Declare supported dialects/features, validate output,
   bound retries, and reject unsupported conversions rather than fabricating
   validity guarantees. See <https://standardschema.dev/json-schema>.
3. Add standalone field-aware code generation only where static metadata exists.
   Keep the runtime `with()` API usable without generated classes.
4. Choose the stable neutral package/repository name and publish through an
   explicit release, with no automatic replacement of `hey-api-builders`.
