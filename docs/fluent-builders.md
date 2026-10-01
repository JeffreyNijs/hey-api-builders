# Named setters on direct builders

Available since `0.1.0-alpha.2`. Use [matching published packages](getting-started.md)
and declare a builder beside your test; no builder file or code generation is required.

Generated ordinary-record builders already have named methods such as
`withName()`. For direct builders, opt into the fields you want:

<!-- recipe:fluent -->

The setters use the schema's **input** types. Validation returns its native output
type, and async transformations remove synchronous build methods while preserving
the named setters. The wrapper uses the existing immutable class facade; choosing
fields does not execute the factory or inspect a native schema.

For a custom spelling, pass a literal method-to-field map:

```ts
const named = fluent(builder, { withUserName: 'user_name' });
```

Literal field tuples and alias maps are checked against finite, ordinary object
records. Runtime-length inventories, index signatures, atomic values, arrays,
nullable root objects and root object unions cannot acquire unsound partial setters.
Use `.replace()` for variant transitions and `.at()` for typed nested updates.
Names that collide with builder/prototype methods, `then` or `toJSON` are rejected.

Automatic names capitalize alphanumeric segments, matching standalone codegen.
Selections contain 1–1,000 fields. Automatic field names allow up to 64 characters;
explicit aliases allow a 1,024-character field and a 128-character method name.
Duplicate fields, colliding names, getters and sparse arrays are rejected before
factory execution.

For classes that should be checked into a project, use
[generated facades](generated-facades-and-paths.md). Generic `.with()` remains the
smallest API when named methods do not make a test clearer.
