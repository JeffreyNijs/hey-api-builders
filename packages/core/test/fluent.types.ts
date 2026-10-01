import { createBuilder, createSchemaBuilder, fluent, type StandardSchemaV1 } from '../src/index.js';

const source = createBuilder((id: number, prefix?: string) => ({
  id,
  name: prefix ?? '',
  'first-name': '',
  age: '7',
}));
const users = fluent(source, ['id', 'name', 'first-name', 'age']);
users.withName('Ada').withId(3).with({ age: '8' }).withFirstName('A').build(1).name.toUpperCase();
// @ts-expect-error Required factory arguments survive the facade.
users.withName('Ada').build();
// @ts-expect-error Setters retain the native input type.
users.withAge(8);
// @ts-expect-error Unknown fields cannot acquire invented typed setters.
fluent(source, ['unknown']);
// @ts-expect-error Dynamic selections cannot promise a particular method inventory.
fluent(source, ['name'] as ('name' | 'age')[]);
// @ts-expect-error A union selector may contain only one of the advertised fields.
fluent(source, ['name' as 'name' | 'age']);
// @ts-expect-error A dynamic alias cannot promise a particular method inventory.
fluent(source, { ['with' + 'Name']: 'name' });
// @ts-expect-error A union selector must not widen a setter to accept the wrong field's value.
fluent(source, { withSomething: 'name' as 'name' | 'id' });
const alias = fluent(source, { renamed: 'name', withEncodedAge: 'age' });
alias.renamed('Ada').withEncodedAge('9').build(1);
// @ts-expect-error Only selected method names exist.
alias.withName('Ada');
const asyncUsers = users
  .transformAsync(async (value) => value)
  .withName('Ada')
  .with({ id: 2 })
  .withId(3);
asyncUsers.buildAsync(1);
// @ts-expect-error Named methods must not restore synchronous build capabilities.
asyncUsers.build(1);
const initiallyAsync = fluent(
  createBuilder(async (id: number) => ({ id })),
  ['id']
);
initiallyAsync.withId(2).buildAsync(1);
// @ts-expect-error Async factories never have synchronous build methods.
initiallyAsync.withId(2).build(1);
const schema = {} as StandardSchemaV1<{ age: string }, { age: number }>;
const parsed = fluent(
  createSchemaBuilder(schema, (age: string) => ({ age })),
  ['age']
);
parsed.withAge('42').buildValidated('7').age.toFixed();
parsed.withAge('42').build('7').age.toUpperCase();
parsed
  .transformAsync(async (value) => value)
  .withAge('42')
  .buildValidatedAsync('7');
// @ts-expect-error Encoded inputs remain distinct from validated output.
parsed.withAge(42);
const parsedAsync = parsed.transformAsync(async (value) => value).withAge('42');
// @ts-expect-error Async schema transitions remain async through named setters.
parsedAsync.buildValidated('7');
const union = createBuilder(
  (): { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean } => ({ kind: 'cat', lives: 9 })
);
// @ts-expect-error Object-union patches require complete replacement, including named setters.
fluent(union, ['kind']);
const arrayBuilder = createBuilder(() => ['a']);
const dateBuilder = createBuilder(() => new Date());
const indexBuilder = createBuilder((): Record<string, string> => ({}));
// @ts-expect-error Arrays are not object-record patches.
fluent(arrayBuilder, ['length']);
// @ts-expect-error Native atomic values cannot be partially patched.
fluent(dateBuilder, ['toISOString']);
// @ts-expect-error Index-signature builders require complete patches.
fluent(indexBuilder, ['name']);
