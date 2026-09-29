import { createSchemaBuilder, type StandardSchemaV1 } from '../src/index.js';
declare function expectType<T>(value: T): void;
declare const schema: StandardSchemaV1<{ age: string }, { age: number }>;
const base = createSchemaBuilder(schema, (age: string) => ({ age }));

// Generated class facades preserve polymorphic fluent chains, including async transitions.
import { createBuilderClass, createSchemaBuilderClass, builderClass } from '../src/index.js';
class PersonBuilder extends createBuilderClass((id: number) => ({ id, name: '' })) {
  withName(name: string) {
    return this.with({ name });
  }
}
const person = new PersonBuilder({ name: 'initial' });
expectType<number>(person.withName('a').replace({ id: 1, name: 'b' }).withName('c').build(1).id);
const asyncPerson = person
  .transformAsync(async (v) => v)
  .withName('async')
  .with({ id: 2 });
expectType<Promise<{ id: number; name: string }>>(asyncPerson.buildAsync(1));
// @ts-expect-error Async transitions retain custom fluent methods but not sync builds.
asyncPerson.withName('no').build(1);
// @ts-expect-error Factory arguments are preserved by the class API.
person.build();
// @ts-expect-error No unknown properties in initial constructor patches.
new PersonBuilder({ other: 1 });
// @ts-expect-error Factory argument types remain unchanged.
person.build('bad');
class ParsedPerson extends createSchemaBuilderClass(schema, (age: string) => ({ age })) {
  withAge(age: string) {
    return this.with({ age });
  }
}
expectType<number>(new ParsedPerson().withAge('1').usingValidation({}).buildValidated('2').age);
const parsedAsync = new ParsedPerson().transformAsync(async (v) => v).withAge('3');
expectType<Promise<{ age: number }>>(parsedAsync.buildValidatedAsync('2'));
// @ts-expect-error Async custom chains cannot recover synchronous validation.
parsedAsync.withAge('4').buildValidated('2');
const AsyncClass = createBuilderClass(async (value: number) => value);
// @ts-expect-error Known asynchronous class factories do not offer sync builds.
new AsyncClass().build(1);
const NativeClass = builderClass(() => base);
expectType<{ age: number }>(new NativeClass().with({ age: '1' }).buildValidated('2'));

import { setPath, omitPath } from '../src/index.js';
const nested: {
  profile: { name: string; note?: string };
  rows: Array<{ id: number }>;
  tuple: readonly [number, string];
} = { profile: { name: '' }, rows: [], tuple: [1, 'x'] };
setPath(nested, ['profile', 'name'], 'Ada');
setPath(nested, ['rows', 0, 'id'], 2);
setPath(nested, ['tuple', 1], 'y');
omitPath(nested, ['profile', 'note']);
// @ts-expect-error Paths preserve leaf types.
setPath(nested, ['profile', 'name'], 2);
// @ts-expect-error Unknown paths are not inferred from the replacement.
setPath(nested, ['missing'], true);
// @ts-expect-error Required nested properties cannot be omitted.
omitPath(nested, ['profile', 'name']);
// @ts-expect-error Tuple indices must be in bounds.
setPath(nested, ['tuple', 2], 1);
// @ts-expect-error Arrays cannot be made sparse by omission.
omitPath(nested, ['rows', 0]);
declare const variant: { pet: { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean } };
// @ts-expect-error Paths cannot change a union discriminant without its complete shape.
setPath(variant, ['pet', 'kind'], 'dog');
setPath(variant, ['pet'], { kind: 'dog', bark: true });
