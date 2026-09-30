# Standalone code generation (unreleased)

Emit deterministic named builder classes from typed factory modules, configured
builder modules, Standard Schema plus a factory, Standard JSON Schema, TypeBox
(both lines), Valibot, Effect, or raw JSON Schema. Application modules are not
executed while emitting source. Their declarations are resolved when the consumer
compiles the generated TypeScript.

```ts
const files = emitBuilders([
  {
    name: 'UserBuilder',
    source: { kind: 'factory', module: '../models.js', export: 'makeUser' },
    fields: ['id', 'name'],
  },
]);
await writeGenerated('./generated', files);
```

`emitJsonSchemaBuilders` emits structural declarations from the same schema used
for fixture generation and validation. Runtime constraints such as patterns and
number bounds are still checked by the original validator, not represented as
fictional TypeScript guarantees. References are supplied explicitly in memory;
filesystem and network resolution are disabled. Module-based schemas retain
native inferred input/output types and factory arguments.

The CLI accepts only data-only JSON:

```sh
test-builders --config builders.json --out generated
test-builders --config builders.json --out generated --check
test-builders --config builders.json --out generated --self-contained --select UserBuilder
```

The configuration has `builders` and/or `schemas` arrays matching the public API.
Module specifiers are relative to the generated files, not the configuration.
Selection defines the desired generated file set. Native schema fields can be
specified explicitly; existing typed `.with()` works without property helpers.

Self-contained mode copies the installed canonical core's JavaScript,
declarations and attribution, not a second runtime implementation. It removes
the core dependency for factory-only output. Native adapters and external factory
imports retain their own dependencies; arbitrary closures are not serialized.

The output manifest stores content hashes. Regeneration skips identical files,
refuses handwritten/modified-file overwrites, and removes only previously owned
stale files. `--check` never creates or writes files. Writes are atomic per file,
not a multi-file filesystem transaction. Generation assumes exclusive access to
the output directory; concurrent writers and hostile filesystem races are not
supported. Paths are bounded, relative and checked for symlinks. Do not edit the
manifest to bypass ownership protection.

Individual package manifests are prepared for the coordinated alpha release; publication is a separate operation.
