# Stabilization evidence and remaining gates

The stabilization work adds typed opt-in named setters, local JSON diagnostics,
a tested native-version matrix and an interactive shrinking/replay recipe. It
also addresses a playground cancellation defect found by repeated browser tests.
The published train remains alpha.1 until a new release is verified.

## Application trials

Two private application trials use published alpha.1 packages in isolated
branches. Their detailed source and validation evidence stay in their own draft
PRs; these are integration checks, not endorsements or production rollout claims.

| Profile                       | Verified behavior                                                                                                                                                | Toolchain and local evidence                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Native Zod and Temporal forms | Existing form refinements, issue paths, date/time values, API transformation and independent fixture branches                                                    | Zod 4.4.3, TypeScript 6.0.3; type-check, 1,164 tests and production build                                    |
| Hey API media fixtures        | Offline generation from an actual contract subset, named methods, validation against the existing client, deterministic Faker instances and real srcset behavior | Hey API 0.99.0 / TypeScript 6.0.3 generator; unchanged TypeScript 5.9.3 app; type-check, 110 tests and build |

The second trial found a vendor limitation: the pinned Hey API Faker generator
emits string literals for TypeScript runtime enums, which fail compilation.
The trial uses the supported default literal-union output and explicitly validates
and resolves enum values through the existing application client. Regeneration
compares every emitted file in a temporary directory and leaves checked-in output
unchanged. Generator TypeScript stays in a separate private tools package; its
upstream declaration barrel references optional frameworks, so that tool's checker
skips third-party declarations. Application source and generated output are still
checked by the application's compiler. No cast hides an incompatible fixture.

## Cancellation and browser failures

Retained traces separated two failures:

- Firefox sometimes completed HTTP/DOM/load events while a driver-issued `goto`
  promise remained pending. The test now uses browser-initiated navigation and
  independently checks the response, URL, UI readiness and security headers.
- A longer run exhausted generation slots after cancelling native regex work.
  The playground now kills a child process and waits for exit before releasing a
  slot. Heap, request/output, time and concurrency budgets remain enforced. A
  regression repeatedly cancels already-running pathological patterns and checks
  that the server can generate again with only one available slot.

[The first process-based Firefox stress run](https://github.com/JeffreyNijs/mimlet/actions/runs/36772679161)
passed 200 cases with zero retries. This is bounded evidence, not a guarantee that
all future browser/driver releases are free of flakes. Normal three-engine and
platform checks remain required at the final release head.

## Compiler cost

`node scripts/benchmark-types.ts` installs the core tarball in a clean consumer,
then compiles ordinary `.with()` and named `fluent()` fixtures with 100 and 500
fields. Each case runs three fresh compiler processes and records wall time,
compiler check time, memory, types and instantiations in
`test-results/typescript-performance.json`. CI retains this alongside the runtime
benchmark report.

One local run on Apple M5, Node 22.21.1 and TypeScript 6.0.3 measured median whole
compiler-process times of 445 ms / 696 ms for 100 fields and 386 ms / 754 ms for
500 fields (`with` / `fluent`). Named setters have a measurable type-checking cost.
These small, hardware-dependent samples are not editor latency measurements or a
performance advantage claim. Prefer a small selected field list for large schemas.

## Before stable publication

Review the [stability contract](stability.md), complete final-head acceptance,
prepare a new coordinated release candidate, and verify an actual new-version
GitHub OIDC publish. Alpha.1's matching-artifact skip run did not exercise that
publication path. Neither private adoption PR is merged by the toolkit release.
