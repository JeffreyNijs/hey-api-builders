import {
  cloneFixture,
  captureFixture,
  restoreFixture,
  fixtureValue,
  createBuilder,
} from '../src/index.js';
declare function expectType<T>(value: T): void;
const input = { at: new Date(), values: new Map<string, number>() };
expectType<typeof input>(cloneFixture(input));
expectType<string>(captureFixture(input));
const restored = restoreFixture(captureFixture(input));
expectType<unknown>(restored);
// @ts-expect-error Deserializing data does not prove an application-specific type.
expectType<typeof input>(restored);
const promise = Promise.resolve(1);
const boxed = createBuilder(() => fixtureValue(promise));
expectType<Promise<number>>(boxed.build().value);
const cloned = createBuilder(() => input, { cloneInput: cloneFixture });
expectType<typeof input>(cloned.build());
// @ts-expect-error Input clone policies must preserve the input type synchronously.
createBuilder(() => input, { cloneInput: async (value) => value });
