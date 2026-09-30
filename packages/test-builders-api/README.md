# API contract fixtures (unreleased)

OpenAPI 3.0, 3.1 and 3.2 operation fixtures independent of Hey API. Inputs are
bounded JSON documents; nothing is fetched from their URLs or executed from their
metadata. Imported external documents must be supplied explicitly in memory.

```ts
const api = openApi(specification);
const request = api.request({ operationId: 'updateUser' });
const fixture = request
  .builder()
  .with({ body: { name: 'Ada' } })
  .buildValidated();
const transport = request.serialize(fixture, { baseUrl: 'https://example.com/api' });
const response = api.response({ operationId: 'updateUser', status: 200 });
```

Requests retain path/query/header/cookie/body groups; header names are lowercase.
Operation-level parameters override path-level declarations. Response selection
respects exact statuses, status classes, and defaults. Multiple media types require
selection unless an application/json representation is declared. Security metadata
is retained, never interpreted as credentials or evidence of authentication.

Read-only request properties and write-only response properties are omitted and
forbidden by this adapter's explicit directional policy. Required lists are adjusted
only for these omitted properties. OpenAPI 3.0 nullable/exclusive-bound and reference
sibling semantics are distinct from 3.1/3.2. Schema constraints remain validated by
the shared JSON Schema provider. Native application types are not invented from a
runtime document: only the HTTP envelope groups are statically known.

Serialization covers simple/label/matrix path parameters, form/deepObject and
space/pipe-delimited query parameters, simple headers, and cookie/form cookies.
Nested RFC6570 values have no universal meaning and are rejected. Reserved query
expansion retains URI-safe reserved data without introducing query delimiters or
fragments. Header control characters are rejected. Built-in content codecs cover
JSON, JSON suffix media types, text, and ordinary URL-encoded forms. Binary/XML/
multipart or other content requires a caller-supplied synchronous codec. Custom
per-property encoding and streaming bodies need a transport-specific adapter.
No HTTP request is ever made.

Inline component references, recursive schemas, external in-memory references,
webhook metadata, schema-only preparation, error paths, bounded sessions and replay
are covered by the packed-consumer suite. Embedded JSON Schema resource IDs/anchors
are rejected in this projection path. The standalone JSON Schema adapter supports
explicit resource IDs within its own reference contract; unsupported anchors still
fail rather than being interpreted differently. This is not a full OpenAPI document validator or an API client.

Individual packages are prepared for coordinated publication; no publication is implied by this source.

## AsyncAPI messages

`asyncApi(document).message({ operationId, messageId })` prepares application
message envelopes with `headers` and `payload`, native schema validation, seeded
sessions, and the core builder API. `fromAsyncApiMessage` is the builder shortcut.
The implemented document families are AsyncAPI 2.0–2.6 and 3.0–3.1. In version 2,
`publish` means the application **receives**, while `subscribe` means it **sends**.
Version 3 uses explicit `send` and `receive` actions.

Operations reference root channels, and version 3 operation-message selections
must refer to that channel's message entries. Generated and validated envelopes
must match exactly one permitted message definition. An overlapping definition can
exhaust bounded sampling; that is not evidence that the schemas are impossible.
Explicit builder overrides are never retried or repaired. All native format
validation/generation callbacks must be pure and synchronous, and may be invoked
multiple times while checking message exclusivity.

Message and operation traits use ordered JSON Merge Patch with explicit target
fields taking precedence. References originating in external traits are rebased
without interpreting example/default data as schemas. Correlation IDs, channel
parameters, and reply addresses use bounded JSON Pointer runtime expressions,
never JavaScript evaluation. Dynamic replies take their address from the original
request supplied to `serialize`, not from an invented reverse-service contract.
Application headers, operation/channel/message bindings, security declarations,
and server metadata remain separate. There is no broker connection, authentication,
or automatic use of credentials in any of these operations.

Channel addresses can be assembled from declared parameters, enums/defaults, or
message locations. Protocol-specific escaping is an explicit `encodeParameter`
callback; topic names are not assumed to be URL paths. A missing channel address
requires an explicit address, or a declared runtime reply-address expression.
Payload serialization requires a declared/default/explicit content type and an
appropriate content codec.

Default AsyncAPI schemas and declared draft-07/OpenAPI schema formats use the
shared JSON Schema provider. Other Multi Format Schemas and legacy `schemaFormat`
payloads require a registered `schemaFormats` factory. These factories preserve
native values and may provide a native clone hook for record classes or other
values outside portable fixture capture. Format strings never cause packages,
URLs, or executable schemas to be loaded. Unsupported inheritance discriminators,
embedded schema resource IDs, and reference semantics fail explicitly.

This is a fixture-focused reader, not a complete AsyncAPI document validator or
protocol binding implementation. Request/reply generation requires an explicit
reply channel with message definitions. The message APIs and serialization paths
are tested against installed package artifacts alongside the HTTP cases.
