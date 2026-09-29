import { createBuilder, createSchemaBuilder, type StandardSchemaV1 } from '../src/index.js';

declare function expectType<T>(value: T): void;
declare const schema: StandardSchemaV1<{ age: string }, { age: number }>;

const base = createSchemaBuilder(schema, (age: string) => ({ age }));
expectType<{ age: string }>(base.build('42'));
expectType<{ age: number }>(base.buildValidated('42'));
expectType<Promise<{ age: number }>>(base.buildValidatedAsync('42'));
expectType<Array<{ age: number }>>(base.with({ age: '7' }).buildValidatedList(2, '42'));
expectType<{ age: number }>(base.replace({ age: '5' }).buildValidated('42'));
// @ts-expect-error Patches use schema INPUT, not transformed OUTPUT.
base.with({ age: 7 });
// @ts-expect-error Factory arguments remain required.
base.build();
// @ts-expect-error Factory output must match schema input; do not widen the schema.
createSchemaBuilder(schema, () => ({ age: 42 }));
// @ts-expect-error Transformations operate on input fixtures.
base.transform(() => ({ age: 7 }));

const options = createBuilder((config: { value: number }, suffix: string) => config.value + suffix);
expectType<string>(options.build({ value: 1 }, 'x'));
expectType<Array<string>>(options.buildList(2, { value: 1 }, 'x'));
// @ts-expect-error All factory parameters must be forwarded.
options.build({ value: 1 });
// @ts-expect-error Factory options must retain their types.
options.build({ value: '1' }, 'x');

const optional = createBuilder((config?: { value: number }) => config?.value ?? 0);
expectType<number>(optional.build());
expectType<number>(optional.build({ value: 2 }));
const asynchronous = createBuilder(async (value: number) => ({ value }));
expectType<Promise<{ value: number }>>(asynchronous.buildAsync(1));
expectType<Promise<Array<{ value: number }>>>(asynchronous.buildListAsync(2, 1));

const dates = createBuilder(() => new Date());
dates.with(new Date());
// @ts-expect-error Date replacements cannot be partial records.
dates.with({});
const maps = createBuilder(() => new Map<string, number>());
maps.with(new Map([['x', 1]]));
// @ts-expect-error Maps are atomic, not partial method bags.
maps.with({});
const arrays = createBuilder(() => [1, 2]);
arrays.with([3]);
// @ts-expect-error Arrays must be replaced with an array, not patched by numeric keys.
arrays.with({ 0: 3 });
const tuple = createBuilder((): [number, string] => [1, 'x']);
tuple.with([2, 'y']);
// @ts-expect-error Tuple replacement preserves element types.
tuple.with(['wrong', 3]);
const primitive = createBuilder(() => 1);
// @ts-expect-error Primitive builders do not accept object patches.
primitive.with({ value: 2 });
// @ts-expect-error Transforms are synchronous even for an async build.
primitive.transform(async (value) => value + 1);

interface User {
  id: string;
  email: string;
}
const users = createBuilder((): User => ({ id: '1', email: 'test@example.com' }));
users.with({ email: 'ada@example.com' });
// @ts-expect-error Whole-record replacement requires all required fields.
users.replace({ email: 'ada@example.com' });
// @ts-expect-error Unknown properties are rejected.
users.with({ madeUp: true });

const nullable = createBuilder((): string | null | undefined => 'value');
nullable.with(null);
nullable.with(undefined);
