# hey-api-builders

[![CI](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/ci.yml/badge.svg)](https://github.com/JeffreyNijs/hey-api-builders/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/hey-api-builders.svg)](https://www.npmjs.com/package/hey-api-builders)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

`hey-api-builders` is a custom [Hey API](https://heyapi.dev/openapi-ts/) plugin
that turns the official `@faker-js/faker` factories into immutable, type-safe
test-data builders.

Use it when a generated Faker factory is the right source of schema-aware
defaults, but a builder is the more readable interface for a test:

```ts
const user = new UserBuilder().withEmail('ada@example.com').with({ role: 'admin' }).build();
```

Version 2 has one focused job. It does not maintain a second schema interpreter,
mocking runtime, or validation layer. Faker generation remains owned by Hey API;
this plugin adds typed overrides, ordered transforms, lists, and builders for
definitions, operation requests, and operation responses.

## Requirements

| Package               | Supported version | Why it is needed                                            |
| --------------------- | ----------------- | ----------------------------------------------------------- |
| Node.js               | `>=22.18.0`       | Runs the generator and this plugin                          |
| `@hey-api/openapi-ts` | `^0.99.0`         | Provides types, the custom-plugin API, and the Faker plugin |
| `@faker-js/faker`     | `^10.0.0`         | Used by the generated Faker factories at runtime            |
| TypeScript            | `^6.0.0`          | Required by Hey API at generation time                      |
| `hey-api-builders`    | `^2.0.0`          | Generates the builder module                                |

The package intentionally tracks a narrow pre-1.0 Hey API range. Hey API's
custom-plugin interface is still evolving, so review both projects' release
notes before upgrading outside that range.

Like Hey API itself, version 2 is an ESM package.

## Installation

Install the generator and builder plugin as development dependencies, then add
Faker as a runtime dependency because the generated factory module imports it:

```sh
npm install --save-dev @hey-api/openapi-ts@^0.99.0 hey-api-builders@^2.0.0 typescript@^6.0.0
npm install @faker-js/faker@^10.0.0
```

With pnpm:

```sh
pnpm add --save-dev @hey-api/openapi-ts@^0.99.0 hey-api-builders@^2.0.0 typescript@^6.0.0
pnpm add @faker-js/faker@^10.0.0
```

If generated Faker code is used only by tests, Faker can be a development
dependency too.

## Configuration

Declare the TypeScript, Faker, and builder plugins in that order. Keeping the
dependencies explicit makes the generated stack and its compatibility target
clear:

```ts
// openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts';
import builders from 'hey-api-builders';

export default defineConfig({
  input: './openapi.yaml',
  output: './src/client',
  plugins: [
    '@hey-api/typescript',
    {
      name: '@faker-js/faker',
      compatibilityVersion: 10,
    },
    builders(),
  ],
});
```

The default export is the canonical API. Named `buildersPlugin` and
`defineConfig` aliases are available when a named import better fits your
configuration style.

Run Hey API as usual:

```sh
npx openapi-ts
```

The plugin generates `src/client/hey-api-builders.gen.ts`. Its exports are also
included in Hey API's generated entry file by default, so either of these import
styles is available:

```ts
import { UserBuilder } from './client';
// or
import { UserBuilder } from './client/hey-api-builders.gen';
```

The builder plugin declares the TypeScript and Faker plugins as dependencies,
but `@faker-js/faker` must still be installed in the consuming project. The
explicit configuration above is recommended because it also fixes Faker's
generated API to compatibility version 10.

### Builder plugin options

```ts
builders({
  // Shared naming case. Category-level `case` values override this.
  case: 'PascalCase',

  // Each category accepts a boolean, a name string/function, or this object.
  definitions: {
    enabled: true,
    name: '{{name}}Builder',
  },
  requests: true,
  responses: '{{name}}Fixture',

  // Re-export generated symbols from the Hey API entry module.
  includeInEntry: true,
});
```

| Option           | Default        | Description                                                                                                                      |
| ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `case`           | `'PascalCase'` | Shared output casing. Supports Hey API's `camelCase`, `PascalCase`, `preserve`, `snake_case`, and `SCREAMING_SNAKE_CASE` values. |
| `definitions`    | `true`         | Generate builders for reusable schemas.                                                                                          |
| `requests`       | `true`         | Generate builders for aggregate operation request values.                                                                        |
| `responses`      | `true`         | Generate builders for operation response factories.                                                                              |
| `includeInEntry` | `true`         | Re-export builder symbols from the generated entry file. It can also be a Hey API symbol predicate.                              |

The three category options accept these equivalent shapes:

```ts
builders({
  definitions: false,
  requests: '{{name}}TestBuilder',
  responses: {
    enabled: true,
    case: 'PascalCase',
    name: '{{name}}Builder',
  },
});
```

A naming string receives the category's full anchor in `{{name}}`. A Hey API
`NameTransformer` function is also accepted when a template is not sufficient.

Faker-specific options such as `locale`, `maxCallDepth`, and `nameRules` belong
on the `@faker-js/faker` plugin, not `builders()`:

```ts
plugins: [
  '@hey-api/typescript',
  {
    name: '@faker-js/faker',
    compatibilityVersion: 10,
    locale: 'en',
    maxCallDepth: 4,
  },
  builders(),
];
```

## Generated builders

Builders are generated only when Hey API produced both the required TypeScript
model and Faker factory. Disabling the matching TypeScript or Faker category
therefore also removes its builder.

### Reusable definitions

A reusable schema named `User` produces `UserBuilder`. Object definitions get a
typed convenience method for every direct property:

```ts
const user = new UserBuilder({ role: 'viewer' })
  .withEmail('ada@example.com')
  .withDisplayName('Ada')
  .build();
```

Property names are normalized to method-safe PascalCase suffixes:
`display_name` and `display-name` both become a method based on
`withDisplayName`. If normalized method names collide, the later method receives
a numeric suffix. The generated TypeScript signature remains indexed to the
original property name.

Primitive and array definitions also receive builders. Their constructor and
`with()` values replace the generated value as a whole rather than merging it.

### Operation requests

An operation with ID `getPet` produces `GetPetRequestBuilder` when the official
Faker plugin emits a request factory. The value uses Hey API's aggregate request
shape, with the applicable `body`, `headers`, `path`, and `query` groups:

```ts
const request = new GetPetRequestBuilder()
  .withPath({ id: 'pet-42' })
  .withQuery({ 'include-history': true })
  .build();
```

Only groups present on the operation receive convenience methods. `with()` is
always available for a typed aggregate patch.

### Operation responses

Response builders include the status code in their name. For example, `getPet`
responses for HTTP 200 and 404 produce `GetPetResponse200Builder` and
`GetPetResponse404Builder`:

```ts
const found = new GetPetResponse200Builder().with({ id: 'pet-42', name: 'Mochi' }).build();

const missing = new GetPetResponse404Builder()
  .with({ code: 'not_found', message: 'No pet found' })
  .build();
```

Object response schemas also receive typed property convenience methods when
their properties can be resolved from the response schema:

```ts
const found = new GetPetResponse200Builder().withName('Mochi').build();
```

`with()` remains available for every response type. Responses with no status
metadata receive a unique ordinal suffix instead. A response without a Faker
factory does not produce a builder.

Hey API owns symbol conflict resolution. Reserved or colliding model names may
therefore be renamed in generated output; import the emitted symbol rather than
assuming an unescaped name.

## Builder API

Every generated class has the same immutable interface.

### `new Builder(initial?)`

The optional constructor value is the initial typed patch:

```ts
const admin = new UserBuilder({ role: 'admin' });
```

For object values, patches are shallow top-level merges. Arrays, primitive
values, and nested properties are replaced. Patch values are not deep-cloned or
frozen.

### `.with(patch)`

Returns a new builder with a shallow patch merged over the previous patch. The
original builder remains usable:

```ts
const base = new UserBuilder({ role: 'viewer' });
const admin = base.with({ role: 'admin' });

base.build(); // still has role "viewer"
admin.build(); // has role "admin"
```

### `.with<Property>(value)`

Definition, request, and resolvable object-response builders expose typed
convenience methods for known properties or request groups. Each is shorthand
for `with()` and also returns a new builder:

```ts
const named = new UserBuilder().withDisplayName('Ada');
```

### `.transform(transformer)`

Returns a new builder with a transform appended. Transforms run in registration
order after Faker generation and patches, on every `build()`:

```ts
const normalized = new UserBuilder().withEmail('ADA@EXAMPLE.COM').transform((user) => ({
  ...user,
  email: user.email.toLowerCase(),
}));
```

The transformer is typed as `(value: T) => T`. It is trusted at runtime and can
still produce a value that violates the OpenAPI schema.

### `.build(options?)`

Calls the official generated Faker factory, applies the current patch, then
applies transforms:

```ts
const user = new UserBuilder().withEmail('ada@example.com').build({
  includeOptional: true,
  useDefault: true,
});
```

### `.buildList(count, options?)`

Builds a fresh value `count` times with the same patch, transforms, and factory
options:

```ts
const users = new UserBuilder({ role: 'viewer' }).buildList(10);
```

`count` must be a safe, non-negative integer. `0` returns an empty array;
negative, fractional, non-finite, and unsafe integer values throw `RangeError`.

## Faker options and deterministic data

`build()` and `buildList()` accept the exact option type of their Hey API Faker
factory. The generated module also exports `BuilderOptions<TFactory>` for code
that needs to derive that first factory argument explicitly.

| Option            | Faker default            | Meaning                                                                                        |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `faker`           | Faker's default instance | A custom `Faker` instance used by the generated factory.                                       |
| `includeOptional` | `true`                   | Include optional properties. A number from `0` to `1` is the inclusion probability.            |
| `useDefault`      | `false`                  | Prefer OpenAPI default values. A number from `0` to `1` is the probability of using a default. |

Options are forwarded unchanged. There is intentionally no builder-specific
`seed` option. Create and seed a Faker instance, then pass it to the build:

```ts
import { Faker, en } from '@faker-js/faker';

function createTestFaker(): Faker {
  const faker = new Faker({ locale: [en] });
  faker.seed(42);
  faker.setDefaultRefDate('2026-01-01T00:00:00.000Z');
  return faker;
}

const first = new UserBuilder().build({
  faker: createTestFaker(),
  includeOptional: true,
});
const second = new UserBuilder().build({
  faker: createTestFaker(),
  includeOptional: true,
});

// `first` and `second` are reproducible because the Faker state starts equal.
```

Passing one seeded instance to `buildList()` produces a deterministic sequence.
Like Faker itself, a reused instance advances its state after every generated
value.

## Composition with validation and request mocking

Builders generate data; they do not validate it. Add Hey API's `zod` plugin if
tests should assert that final patched or transformed values still satisfy the
schema:

```ts
plugins: [
  '@hey-api/typescript',
  { name: '@faker-js/faker', compatibilityVersion: 10 },
  'zod',
  builders(),
];
```

```ts
import { UserBuilder, zUser } from './client';

const user = zUser.parse(new UserBuilder().build());
```

For network interception, pair generated data with Hey API's `msw` plugin or
another mocking library. Network routing is intentionally outside this
package's scope.

## Migration from v1

Version 2 is a clean rewrite, not a source-compatible extension of version 1.

1. Upgrade Hey API and install Faker 10.
2. Add the official `@faker-js/faker` plugin before `builders()`.
3. Remove v1-only builder options.
4. Regenerate the client and update imports to `hey-api-builders.gen.ts` or the
   generated entry module.
5. Preserve returned builder instances when calls are not chained; v2 methods
   do not mutate the original builder.

Before:

```ts
builders({
  generateZod: true,
  mockStrategy: 'runtime',
  output: 'builders.gen.ts',
});
```

After:

```ts
plugins: [
  '@hey-api/typescript',
  { name: '@faker-js/faker', compatibilityVersion: 10 },
  'zod', // only when runtime validation is wanted
  builders(),
];
```

The following v1 features were removed:

- `mockStrategy`, including the custom runtime, static, and Zod mock strategies;
- `generateZod`, `useZodForMocks`, and `useStaticMocks`;
- the custom output-name option;
- generated `setOptions()` and the v1-specific mock option object;
- bundled Zod generation and validation helpers;
- legacy compatibility aliases.

Equivalent schema-aware defaults now come from Hey API's official Faker plugin.
Use Hey API's official Zod plugin for validation. Runtime options now belong on
`build()` or `buildList()`:

```ts
const configured = new UserBuilder().with({ role: 'admin' });
const value = configured.build({
  includeOptional: true,
  useDefault: true,
});
```

## Compatibility and limitations

- The repository's end-to-end suite exercises representative OpenAPI 2.0, 3.0,
  and 3.1 documents through the real Hey API generator, TypeScript compiler,
  Faker factories, and generated builders.
- TypeScript 7 is intentionally outside the supported range until Hey API 0.99
  no longer relies on compiler APIs removed by that release.
- Schema constraint handling, optional-property probability, default selection,
  recursion limits, locales, and custom name rules are implemented by Hey API's
  Faker plugin. This package forwards its factories and options rather than
  reimplementing them.
- Patches are shallow. Nested objects and arrays are replaced, not deep-merged.
- Builder immutability applies to builder configuration. User-provided objects
  are not cloned or frozen.
- Overrides and transforms are trusted and are not runtime-validated.
- Convenience `with<Property>()` methods are emitted for direct definition
  properties, aggregate request groups, and response properties that can be
  resolved from direct schemas, references, or compositions.
- Builders are emitted only for definitions, requests, and responses that have
  the corresponding generated model/factory symbols.
- The generated output filename is owned by the plugin and is not configurable
  in v2.
- Webhooks, network interception, persistence, and framework fixtures are out of
  scope.

## Contributing

Use Node.js 22.18 or newer and pnpm:

```sh
pnpm install
pnpm validate
pnpm pack:check
```

`pnpm validate` checks formatting, linting, package types, end-to-end generation
and runtime behavior, coverage, and the distributable build. The end-to-end
tests invoke the public Hey API generator and compile the complete generated
tree; they do not mock the plugin API.

Bug reports should include the OpenAPI fragment, generated builder name, and
exact versions of Node.js, `@hey-api/openapi-ts`, `@faker-js/faker`, and this
package. Open an issue or pull request in the
[GitHub repository](https://github.com/JeffreyNijs/hey-api-builders).

## Releases

See [CHANGELOG.md](./CHANGELOG.md) for user-visible changes. Maintainer releases
use a `v<package-version>` GitHub release tag; publishing runs from the tagged
commit after the repository validation gates pass.

## License

[MIT](./LICENSE)
