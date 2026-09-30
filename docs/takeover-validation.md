# Toolkit completion and handoff

The product goal is a schema-independent test-data toolkit: an independent builder
core, native schema capabilities, automatic generation, reproducible scenarios and
property testing, generated classes, protocol integrations, and local developer
tooling. The accepted [product roadmap](product-roadmap.md) remains the scope.
Maintenance changes must preserve these capabilities rather than reduce the goal
to a smaller Hey API plugin or a file-extension migration.

## Inherited checkpoint

H is `fdb14630c440154638b2a3a657e8b773f571385f`, the final committed checkpoint of
[PR #20](https://github.com/JeffreyNijs/hey-api-builders/pull/20). The source author's
completion report states that its implementation and documentation are committed;
no additional uncommitted artifact was supplied. All twelve reported checks passed
on H, but subsequent inspection found that its audit step masked a failing audit
behind a successful logging pipe. H's green status did not prove a clean production
dependency graph. A separate local `pnpm validate` run also passed: 349 runtime/integration
cases and 16 tooling tests, excluding repeated platforms and generated property
examples. The browser workflow additionally verified 24 browser cases on H.

`codex/schema-toolkit-completion` retains H and all its ancestors. Its replacement
PR targets `main`; the incremental maintenance diff is H to the replacement head.
The two original local checkouts and the source branch remain separate. PR #20 is
superseded only after the replacement's final checks pass and its ancestry is
reconciled with the source branch. Neither merging nor publication is part of this
handoff.

## Requirement and evidence map

| Requirement                                                                                | Status after handoff work                                                                                                                      | Executable evidence                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent immutable core, async capabilities, native values and input/output types       | Implemented at H; native validation diagnostics corrected here                                                                                 | [Core runtime/type suites](../packages/test-builders/test), [typed source contracts](../tests/unit/test-builders.test.ts)                                                              |
| Both TypeBox lines, complete union construction, codecs and references                     | Preserved; common SDK contract checks added against installed packages                                                                         | [TypeBox consumers](../tests/compatibility/typebox)                                                                                                                                    |
| Zod, ArkType, Valibot and Effect interoperability                                          | Preserved; conformance subject typing fixed for adapters without an input checker                                                              | [Standards consumers](../tests/compatibility/standard-libraries), [Effect consumers](../tests/compatibility/effect), [SDK declaration cases](../tests/compatibility/adapter/types.mts) |
| Profiles, independent JSON validation, checked negative cases and realistic Faker values   | Preserved within the existing explicit dialect/provider contract                                                                               | [JSON Schema consumers](../tests/compatibility/json-schema), [Faker consumers](../tests/compatibility/faker)                                                                           |
| Sessions, replay, fixture capture, relationships, traits and genuine shrinking             | Preserved; fast source property tests supplement the emitted-code suites                                                                       | [Session and scenario suites](../packages/test-builders/test), [shrinking consumers](../tests/compatibility/fast-check)                                                                |
| Hey API and standalone generation, fluent classes, incremental/check/self-contained output | Preserved with one canonical runtime                                                                                                           | [Generated-code integration tests](../tests/e2e), [installed codegen cases](../tests/compatibility/codegen)                                                                            |
| OpenAPI/AsyncAPI, GraphQL, Protobuf and Avro semantics                                     | Preserved; native preparation, validation, generation and codecs separated internally                                                          | [API consumers](../tests/compatibility/api), [GraphQL](../tests/compatibility/graphql), [Protobuf](../tests/compatibility/protobuf), [Avro](../tests/compatibility/avro)               |
| Adapter SDK, inspection, local playground and optional fixture consumers                   | Preserved; generative-only SDK subjects now type-check                                                                                         | [SDK](../tests/compatibility/adapter), [playground](../tests/compatibility/playground), [consumers](../tests/compatibility/consumers), [browser acceptance](../tests/browser/specs)    |
| Independent packages, release metadata, minimum compiler and runtime portability           | Preserved; isolated consumers receive shared compiler policy; audit status propagation and a vulnerable transitive pin corrected               | [Package acceptance](../tests/package), [audit failure regressions](../tests/tooling/audit.test.mjs), [portable contract](../tests/runtimes/contract.mjs)                              |
| Familiar typed development workflow                                                        | Added: source suites for all seventeen packages, explicit watch mode, consistent scripts, Turbo graph, typed documentation and benchmark tools | [Source suites](../tests/unit), [contributor commands](../CONTRIBUTING.md)                                                                                                             |

## Interface and verification boundaries

Validation errors now use `VALIDATION_FAILED` and a generic message. Native issues
remain available through non-enumerable `error.issues`. The original issue objects
and paths are retained. This closes a demonstrated case where a validator echoing
input exposed that value through the default error message and JSON serialization.
Trusted callbacks that throw their own exceptions retain their existing behavior.

Sharing compiler configuration produced byte-identical declarations for all
seventeen packages. For the subsequent GraphQL, Protobuf and Avro refactors,
before/after declarations were compiled in both assignment directions for every
exported value and named interface. GraphQL and Protobuf consumers continue to
compile without adding DOM types; Avro retains its existing Node requirement.
The package names, export maps, dependency ranges and prepared release versions
are unchanged. New internal modules stay behind the existing package exports.

The workspace's `js-yaml@4` override is updated from 4.3.1 to 4.3.2 for
[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh). The isolated
codegen consumer already locked the patched version. CI and release preparation
now call `pnpm audit:production`, which saves the report and retains the auditor's
exit status. Tests exercise successful audits, advisory failures, registry failures
and a missing audit process; none can become successful through output logging.

Vitest discovery includes a source suite for every package. Watch mode was checked
with an internal Protobuf validation-module edit: its dependent source suite reran
successfully without rebuilding package output. Full verification still runs the
Node emitted-code suites, negative declaration tests and isolated npm consumers.
Shared SDK cases do not change which product packages their existing coverage gates
measure; the SDK continues to have its own independent coverage suite.

The final replacement head must pass `pnpm validate`, `pnpm pack:check`, production
audit, browser acceptance, portable runtime/compiler checks, executable recipes and
the performance report. Earlier green checkpoints do not satisfy those gates.
Performance output records the actual machine/runtime and correctness checks;
absolute latency guarantees and improvements are not inferred from a single run.

The [compatibility contract](compatibility.md) retains existing justified limits,
including opaque callbacks, unsupported schema vocabularies, provider/version-bound
replay, native-only codecs and the absence of an OS sandbox. No missing accepted
feature is reclassified as unsupported by this maintenance pass. Node and pnpm
remain the development baseline; Bun is a tested core consumer, and the playground
retains its existing UI framework. Publication, external account setup and live
consumer migration remain separate [release operations](releases.md).
