# Test builders (unreleased)

A standalone, schema-independent builder runtime. Factories generate data;
Standard Schema validators optionally validate it. Hey API, Faker and Zod are
not dependencies of this package.

The provisional package name is `@jeffreynijs/test-builders`. It is deliberately
private and unpublished while the public API is reviewed. Do not try to install
it from npm yet. From this repository, build and pack it locally:

```sh
pnpm build:core
npm pack ./packages/test-builders --ignore-scripts
# Install the resulting .tgz in the consuming project.
```

The package emits ESM and TypeScript declarations, with no runtime dependencies.
Its declaration types use TypeScript's `NoInfer` utility (TypeScript 5.4+).

## Without a schema

```ts
import { createBuilder } from '@jeffreynijs/test-builders';

interface User {
  id: string;
  email: string;
  role: 'reader' | 'admin';
}

const users = createBuilder((options: { id: string }): User => ({
  id: options.id,
  email: 'reader@example.com',
  role: 'reader',
}));

const admins = users.with({ role: 'admin' });
const ada = admins.with({ email: 'ada@example.com' }).build({ id: 'user-1' });
const readers = users.buildList(3, { id: 'shared-test-id' });
```

Factory arguments are forwarded unchanged, including optional, required and
multiple arguments. A factory can use Faker, an existing generated factory,
a deterministic fixture, or application-specific logic. Factories are invoked
on every build, even when a later replacement supplies the whole value.

## Standard Schema validation

```ts
import { z } from 'zod';
import { createSchemaBuilder } from '@jeffreynijs/test-builders';

const UserInput = z
  .object({ email: z.email(), age: z.string() })
  .transform((input) => ({ ...input, age: Number(input.age) }));

const users = createSchemaBuilder(UserInput, () => ({
  email: 'reader@example.com',
  age: '42',
}));

const input = users.with({ age: '43' }).build(); // age: string
const output = users.with({ age: '43' }).buildValidated(); // age: number
const asyncOutput = await users.buildValidatedAsync();
```

The contract is structural Standard Schema v1, not Zod-specific. See
<https://standardschema.dev/schema>. The standalone tests exercise a custom
implementation, and the repository integration tests exercise Zod. Other
implementations are accepted through the same interface, but are not all
individually tested in this change.

The pipeline is **factory input -> patches -> transforms -> optional validation
-> validator output**. Validation runs exactly once for each validated build.
It does not silently retry, repair explicit overrides, or apply a schema's
transformation a second time.

Ordinary `build()` and `buildAsync()` deliberately do not validate. They remain
useful for constructing invalid fixtures for negative tests. Patches and
builder transforms are input-typed; only validated methods return output types.

Validation failures throw `BuilderValidationError`, preserving the standard
`issues` array and its paths. Exceptions thrown by the validator itself propagate
unchanged. An empty `issues` array is still a failure, not a successful result.

## Builder methods

| Method                                    | Behavior                                                   |
| ----------------------------------------- | ---------------------------------------------------------- |
| `with(patch)`                             | Return a new builder with an additional shallow patch.     |
| `replace(value)`                          | Return a new builder replacing the entire value.           |
| `transform(fn)`                           | Append a synchronous input-to-input transform.             |
| `build(...args)`                          | Build input synchronously, without validation.             |
| `buildAsync(...args)`                     | Build input, accepting an asynchronous factory.            |
| `buildList(count, ...args)`               | Build input values synchronously.                          |
| `buildListAsync(count, ...args)`          | Build input values sequentially and asynchronously.        |
| `buildValidated(...args)`                 | Build and synchronously validate, returning schema output. |
| `buildValidatedAsync(...args)`            | Await the factory and validation, returning schema output. |
| `buildValidatedList(count, ...args)`      | Build and validate a list synchronously.                   |
| `buildValidatedListAsync(count, ...args)` | Build and validate a list sequentially and asynchronously. |

The four validated methods exist only on schema builders. Synchronous methods
reject promise-like results; use the corresponding asynchronous method when a
factory or validator is asynchronous. Builder transforms remain synchronous.

Lists preserve generation/validation order rather than launching concurrent
factories. Counts must be non-negative safe integers that fit a JavaScript array
length. Zero invokes neither the factory nor validation. Large accepted counts
can still exhaust available memory; this is not a resource quota.

## Patches, identity and non-JSON values

Only plain records (including null-prototype records in the current realm) are
shallow-merged. Nested values and arrays are replaced. Dates, maps, sets, regular
expressions and typed arrays retain their identity when replaced, instead of
being spread into `{}`.

Use `replace()` for whole-record replacement or custom class instances. A partial
record patch of a non-record value throws rather than discarding its prototype.
TypeScript cannot reliably distinguish every custom class from a plain record;
this guard is also enforced at runtime.

All patches run in registration order before all transforms, even if calls are
interleaved. A later `replace()` discards earlier patches' effects. Explicit
`with(undefined)` is a replacement when the input type permits `undefined`.

Immutability applies to builder configuration, not user data. Factories must
return fresh values when isolation is required. Overrides and replacements are
not cloned or frozen, and a shared object remains shared between builds.

## What this does not do

- It does not automatically invent data from an arbitrary validator. Standard
  Schema exposes validation, not a property tree or a sample generator.
- It does not yet interpret JSON Schema/OpenAPI, or generate named classes and
  `withEmail()` methods for non-Hey API inputs. Use typed `with({ email: ... })`.
- It does not replace the existing Hey API plugin in this first change. That
  integration and its generated API remain intact.

A later generation adapter can supply factories from Standard JSON Schema or
another documented schema format. It should declare supported features and
allow custom factories rather than pretending every refinement is generatable.

## Development

From the repository root:

```sh
pnpm test:core
pnpm validate
```

The core has its own strict compiler configuration and negative type tests.
Runtime tests use Node's built-in test runner; Zod compatibility is exercised by
the repository's existing Vitest dependency. No new registry dependencies or
lockfile changes are required.
