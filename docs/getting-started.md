# Meet Mimlet

**Test data, with character.** Build typed fixtures, keep scenarios connected, and
reproduce failures with explicit seeds and compatible replay records.

Mimlet's core has no runtime dependencies. Schema adapters, generation engines,
protocols, code generation and the local playground are independently installable
packages. [Choose an adapter](adapters.md) for the capabilities you need.

## Source preview

The source prepares `mimlet` and `@mimlet/*` at `0.1.0-alpha.0`, alongside
`hey-api-builders@3.0.0-alpha.0`. The new names are **not published or reserved**.
Do not assume a similarly named registry package is this project.

During review, use Node **22.18 or newer** and the repository's pinned pnpm:

```sh
git clone --branch codex/mimlet-brand-and-docs https://github.com/JeffreyNijs/hey-api-builders.git
cd hey-api-builders
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test:examples
corepack pnpm docs:dev
```

The example test command installs actual toolkit tarballs in a temporary consumer,
compiles the recipes, and runs them. It does not publish anything. If Corepack is
not available in your Node installation, use pnpm **10.34.5** directly.

## Your first fixture

This example uses modern `typebox@1.3.34` and `@mimlet/typebox`. It is the same
source compiled and executed by `pnpm test:examples` and shown on the home page.

<!-- recipe:hero -->

The original builder remains unchanged when you call `.with()`. `.build()` creates
schema input; `.buildValidated()` validates that input and returns decoded output.
Those types can differ when your schema has a codec or transform. Use the async
methods when validation or the factory is asynchronous.

## Try an isolated consumer

From a clean, committed Mimlet checkout, `pnpm release:prepare` creates the verified
tarballs and their digest manifest in `release/`. The command requires a clean
tree and refuses to overwrite an existing release directory.

In a separate test project, install the core and TypeBox adapter tarballs together:

```sh
npm init -y
npm pkg set type=module
npm install /absolute/path/to/checkout/release/mimlet-0.1.0-alpha.0.tgz /absolute/path/to/checkout/release/mimlet-typebox-0.1.0-alpha.0.tgz typebox@1.3.34
```

Replace the absolute paths with the checkout you built. Add only the adapters you
need, using the matching release train. This local workflow works before registry
publication; public install instructions will change only after a verified release.

## When generation needs your help

Automatic generation has a supported capability set. A native refinement, custom
format or callback may need an explicit factory:

<!-- recipe:factory -->

Use a factory to express meaningful domain data while retaining native validation.
A generation failure does not prove that a schema has no valid values.

Continue with [scenarios](correlated-scenarios.md), [replay](sessions-and-replay.md),
or the [coding-agent recipes](agents.md). Existing Hey API users should read the
[migration guide](hey-api-migration.md).
