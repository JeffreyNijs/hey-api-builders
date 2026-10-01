# Mimlet's Zod adapter

Introduced in the coordinated toolkit `0.1.0-alpha.1` train.

Native builders for **Zod 4**, including Zod Mini. Alpha.1 pinned 4.4.3;
alpha.2 supports the tested range 4.4.3 through 4.6.5. Input and output types come
from the original schema. Automatic generation uses its input JSON Schema;
validation, transforms, defaults and codecs remain native Zod operations.
The dependency-free core remains separate.

See the [executable Zod and ArkType guide](../../docs/zod-and-arktype.md) for tested
recipes and the [compatibility matrix](../../docs/compatibility.md) for version bounds.

## Builders

| Entry point                                     | Contract                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fromZod(schema, options)`                      | Synchronous input generation and native synchronous validation.                                                                 |
| `fromZodAsync(schema, options)`                 | Async-only builder; validation goes directly through `safeParseAsync`.                                                          |
| `fromZodFactory(schema, factory, options)`      | Caller-provided input; factory tuples and known async capabilities are retained. Validation uses the synchronous native parser. |
| `fromZodFactoryAsync(schema, factory, options)` | Async-only builder with native async validation; accepts sync or async input factories.                                         |

Use an explicit async entry point for schemas with async refinements or codecs.
Calling an async build method on a synchronous adapter does not select a different
native parsing mode. The dedicated async path avoids the pinned Zod Standard
entry's sync probe/retry. A callback exception propagates without another parse.

`.build()` produces input, while `.buildValidated()` returns native parsed output.
Async variants expose `.buildAsync()` and `.buildValidatedAsync()`. All ordinary
Mimlet patches, replacement, list budgets, cloning and transforms remain available.
Switch object-union variants with a complete `.replace()` value.

## Native operations and generation

`zodAdapter(schema, options)` retains `source` and exposes `standard`,
`standardAsync`, `decode`, `decodeAsync`, `encode` and `encodeAsync`. Encoding
delegates to Zod: codecs can reverse a value, while one-way transforms throw the
native encoding error. No inverse or shrinker is synthesized. Native parse options
can be supplied through `parseOptions`; validation failures retain Zod issue paths
inside the core's `BuilderValidationError`.

`generation()` prepares and caches the JSON Schema generator on demand. It exposes
the existing profiles, budgets, references, versioned providers and session/replay
identity. `create(session?)` generates schema input. Automatic builders prepare
generation immediately, so unsupported conversion fails before use.

Conversion supports Draft 7 and Draft 2020-12. It throws for unrepresentable native
values rather than converting them to an unconstrained schema. Date, Map, Set,
bigint, custom predicates and application data can use factories without requiring
JSON conversion. Opaque refinements can reject generated candidates when native
validation runs; bounded generation is not a solver for arbitrary callbacks.

The generation identity covers the converted input and generator configuration.
Keep application schema/codec versions in your replay identity when output depends
on opaque functions. Native conversion and callbacks are trusted application code;
generation budgets do not sandbox them. DOM types are needed by Zod's declarations.
