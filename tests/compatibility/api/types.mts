import {
  fromOpenApiRequest,
  fromOpenApiResponse,
  openApi,
  serializeParameter,
  type HttpRequestFixture,
} from '@jeffreynijs/test-builders-api';
import type { SchemaBuilder, GenerationSession } from '@jeffreynijs/test-builders';
declare const document: unknown;
declare function expectType<T>(value: T): void;
const request = fromOpenApiRequest(document, { operationId: 'users' });
expectType<SchemaBuilder<HttpRequestFixture, HttpRequestFixture, [session?: GenerationSession]>>(
  request
);
expectType<HttpRequestFixture>(request.with({ query: { id: 1 } }).buildValidated());
// @ts-expect-error Runtime-loaded schemas cannot invent a User application type.
const user: { id: string } = request.build().body;
// @ts-expect-error The HTTP envelope has known groups.
request.with({ madeUp: true });
// @ts-expect-error Select a concrete response status.
fromOpenApiResponse(document, { operationId: 'users' });
// @ts-expect-error Async fluent transitions cannot advertise synchronous validation.
request.transformAsync(async (value) => value).buildValidated();
expectType<string>(openApi(document).request({}).serialize({}).url);
// @ts-expect-error Parameter locations are a closed protocol-specific set.
serializeParameter({ name: 'id', in: 'body' }, 1);
void user;
