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
are rejected in this projection path; use the standalone JSON Schema adapter for
those resources. This is not a full OpenAPI document validator or an API client.

All packages remain private pending coordinated release preparation.
