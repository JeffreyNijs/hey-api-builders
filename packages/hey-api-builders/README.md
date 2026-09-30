# Hey API Builders

Hey API integration for the schema-independent Mimlet toolkit. This
`3.0.0-alpha.0` line is a major-version migration on the `next` channel.
The stable v2 line remains available separately.

The plugin discovers generated model, request and response factories from
`@hey-api/openapi-ts`, then emits named fluent classes backed by the shared
`@mimlet/core` runtime. Hey API and Faker are not dependencies of
the neutral runtime itself.

## Installation and generation

Use matching plugin and core versions. See [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html)
for current registry availability, or build and install the workspace tarballs.
The generated client requires the matching core runtime plus Faker.
The verified generation toolchain is Hey API 0.99.0, Faker 10.5.0 and TypeScript
6.0.3. Runtime Node support starts at 22.18.0.

```ts
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as builders } from 'hey-api-builders';

export default defineConfig({
  input: './openapi.json',
  output: './generated',
  plugins: [
    '@hey-api/typescript',
    '@faker-js/faker',
    builders({
      definitions: true,
      requests: true,
      responses: true,
    }),
  ],
});
```

After generation, ordinary object models retain their familiar API:

```ts
const user = new UserBuilder().withEmail('ada@example.com').build();
```

Category settings (`definitions`, `requests`, `responses`) accept booleans,
naming templates/functions, or `{ enabled, case, name }`. Category-specific
casing overrides the shared `case`. `includeInEntry` and the vendor's plugin
hooks remain available. `runtimeModule` changes the generated runtime import
specifier for controlled package layouts; it does not select a second runtime
implementation or fetch that module during emission.

## Migration from v2

Generated clients must install the matching `@mimlet/core` runtime.
Regenerate clients with the upgraded plugin and keep that generated diff in the
consumer migration. Do not silently release these changes as a v2 patch.

Builders retain constructor patches, `with`, `transform`, `build`, `buildList`
and generated property helpers for ordinary records. Fluent subclass types are
retained after configuration. Fresh per-build overrides, whole replacements,
optional omission, async transforms/builds, and operation inspection now share
the canonical runtime.

Object-union transitions require complete replacement rather than a partial
discriminant patch. Record/non-record transitions are explicit. Lists have the
core's default 10,000-item allocation budget. All patches run before transforms.
Async chains retain property helpers but do not expose synchronous build methods
in TypeScript. Native Date/Map values are not spread into plain objects.

The repository's [migration guide](../../docs/hey-api-migration.md) explains these
contracts. The [archived v2 guide](../../docs/hey-api-v2.md) is retained only as
historical configuration/reference documentation, not current installation advice.

## Verification

Real Swagger 2, OpenAPI 3.0 and OpenAPI 3.1 fixtures are generated, compiled and
executed. Negative declaration cases test incorrect properties, incomplete union
transitions and async capability changes. A clean packed consumer installs the
actual core/plugin tarballs, runs the real generator, compiles the generated
NodeNext client, and imports its emitted ESM without source aliases.
