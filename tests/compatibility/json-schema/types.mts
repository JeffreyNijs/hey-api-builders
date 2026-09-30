import {
  fromJsonSchema,
  fromStandardJsonSchema,
  jsonSchemaAdapter,
  type JsonSchema,
} from '@mimlet/json-schema';
import type { StandardSchemaV1, StandardJSONSchemaV1, GenerationSession } from '@mimlet/core';
declare function expectType<T>(value: T): void;
declare const schema: StandardSchemaV1<{ age: string }, { age: number }> &
  StandardJSONSchemaV1<{ age: string }, { age: number }>;
const users = fromStandardJsonSchema(schema);
expectType<{ age: string }>(users.with({ age: '42' }).build());
expectType<{ age: number }>(users.buildValidated());
expectType<Promise<{ age: number }>>(users.buildValidatedAsync());
// @ts-expect-error Input overrides are not decoded outputs.
users.with({ age: 42 });
// @ts-expect-error Unknown fields cannot appear in a typed patch.
users.with({ unknown: true });
// @ts-expect-error Required fields cannot be omitted.
users.omit('age');
// @ts-expect-error Validated output must not degrade to any or string.
expectType<string>(users.buildValidated().age);
const raw = fromJsonSchema({ type: 'integer' });
expectType<unknown>(raw.build());
// @ts-expect-error Runtime schemas do not synthesize inferred application types.
expectType<number>(raw.build());
// @ts-expect-error Raw-schema constructor has no unchecked generic type parameter.
fromJsonSchema<{ id: string }>({ type: 'object' });
expectType<GenerationSession>(jsonSchemaAdapter(true).session());
const asynchronous = users.transformAsync(async (v) => v);
// @ts-expect-error Async transforms remove guaranteed-failing synchronous APIs.
asynchronous.build();
const document: JsonSchema = { type: 'object', properties: { value: { type: 'integer' } } };
jsonSchemaAdapter(document, {
  formatsIdentity: 'v1',
  formats: {
    custom: { validate: (s) => s.startsWith('x'), generate: (random) => String(random.int(1, 2)) },
  },
});
// @ts-expect-error Profiles are explicit, not arbitrary schema mutations.
fromJsonSchema(document, { profile: 'unsafe' });
// @ts-expect-error Asynchronous format checks are not accepted.
jsonSchemaAdapter(document, { formats: { x: { validate: async () => true, generate: () => '' } } });
