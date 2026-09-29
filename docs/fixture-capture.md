# Fixture capture, cloning, and promise data

`captureFixture(value)` returns a versioned JSON string. `restoreFixture(text)`
returns `unknown`, not a falsely inferred application type. Validate restored data
with the chosen schema before treating it as application input.

The supported graph contains plain records, null-prototype records, arrays
(including holes and enumerable custom properties), dates, maps, sets, regular
expressions, ArrayBuffers, and the standard ES2022 numeric/BigInt views and
DataView. Cycles, repeated object identities, and shared view backing buffers are
preserved. Scalars retain `undefined`, big integers, NaN, infinities, and negative
zero. RegExp source, flags, and nonnegative integer lastIndex are retained.

```ts
import { captureFixture, restoreFixture, cloneFixture } from '@jeffreynijs/test-builders';

const owner = { id: 'customer-1' };
const fixture = { owner, orders: [{ customer: owner }] };
const saved = captureFixture(fixture);
const restored = restoreFixture(saved); // unknown; validate before application use
const isolated = cloneFixture(fixture); // retains the known input type
// isolated.orders[0].customer === isolated.owner
// isolated.owner !== fixture.owner
```

`cloneFixture` creates mutable fixture data; it does not preserve property
writability, sealing, or freezing. Accessors, non-enumerable/symbol properties,
custom classes, functions, promises, weak collections, host resources, native
subclasses, and custom native-object properties are rejected rather than silently
lost. Such values need an explicit application serializer or clone callback.
Proxies can execute their traps when inspected and are trusted application code.

The decoder has a fixed constructor whitelist. It never evaluates source,
looks up arbitrary globals, or fetches references. Prototype-related names are
restored as own data properties, not applied through prototype setters. Capture
is not encryption: stored fixtures can contain sensitive data.

Options bound nodes (10,000), token entries (100,000), encoded characters
(10,000,000), and backing buffer bytes (1,000,000). Encoder recursion defaults to
100 and cannot exceed 256. Decoding reconstructs a flat graph without recursive
edge traversal. Limits bound representation work, not arbitrary Proxy traps or
application callbacks. Malformed captures fail with `INVALID_CAPTURE`; budget
failures and unsupported values have separate error codes.

## Opt-in builder input cloning

```ts
import { createBuilder, cloneFixture } from '@jeffreynijs/test-builders';

const shared = { tags: ['baseline'] };
const fixtures = createBuilder(() => shared, { cloneInput: cloneFixture }).transform((value) => {
  value.tags.push('test');
  return value;
});
```

The composed input is cloned after patches/replacements/omissions and before
transforms or validation. This protects shared factory results and overrides from
mutation by those later steps. Cloning is opt-in and synchronous. Callbacks that
subsequently return a different externally shared value remain responsible for
that value's identity; the library does not claim universal output isolation.
Custom clone callbacks can support application classes. Existing `withFactory`
and `replaceFactory` remain convenient ways to create fresh overrides.

## Promise or thenable fixture data

Use `fixtureValue(promise)` to distinguish promise-valued data from asynchronous
execution:

```ts
import { createBuilder, fixtureValue } from '@jeffreynijs/test-builders';
const promise = Promise.resolve(42);
const fixtures = createBuilder(() => fixtureValue(promise));
const data = fixtures.build();
// data.value === promise; the builder does not await the nested value.
```

The wrapper is explicit and frozen. It is not a promise serializer; a capture of
that wrapper still rejects its unsupported promise value.
